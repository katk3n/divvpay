/**
 * DivvPay - Standalone Apps Script Backend (Code.js)
 * Antigravity - Premium Web App implementation
 */

// Global sheet names
var SHEETS = {
  EXPENSES: 'expenses',
  SETTLEMENTS: 'settlements',
  MEMBERS: 'members',
  CATEGORIES: 'categories'
};

/**
 * Sanitize text input to prevent Spreadsheet Formula Injection (CSV Injection).
 * Prefixes strings starting with =, +, -, @ with a single quote to force text evaluation.
 */
function sanitizeTextInput(text) {
  if (text === null || text === undefined) return '';
  var str = String(text).trim();
  if (str.length > 0) {
    var firstChar = str.charAt(0);
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
      return "'" + str;
    }
  }
  return str;
}

/**
 * Serves the web application.
 */
function doGet(e) {
  // Extract spreadsheet ID from various potential parameter names
  var spreadsheetId = '';
  if (e && e.parameter) {
    spreadsheetId = e.parameter.id || e.parameter.ssId || e.parameter.spreadsheetId || e.parameter.ss || '';
  }
  
  var template = HtmlService.createTemplateFromFile('index');
  template.spreadsheetId = spreadsheetId;
  
  var webAppUrl = '';
  try {
    webAppUrl = ScriptApp.getService().getUrl();
  } catch(err) {
    // Falls back to empty string if run in execution contexts without ScriptApp context
  }
  template.webAppUrl = webAppUrl;
  
  var title = 'DivvPay | 友人との立替・精算管理';
  if (spreadsheetId) {
    try {
      var ss = SpreadsheetApp.openById(spreadsheetId);
      title = ss.getName() + ' | DivvPay';
    } catch(err) {
      // Falls back to default if spreadsheet is not found or has no access permissions
    }
  }
  
  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper to get the spreadsheet by ID.
 */
function getSpreadsheet(spreadsheetId) {
  if (!spreadsheetId) {
    throw new Error('スプレッドシートIDが指定されていません。URLパラメータ「?id=」にスプレッドシートIDを設定してください。');
  }
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (err) {
    throw new Error('スプレッドシートを開けませんでした。IDが正しいか、またはアクセス権限（共有設定）があるか確認してください。 (ID: ' + spreadsheetId + ')\nエラー: ' + err.message);
  }
}

/**
 * Initializes the database tables if they do not exist in the spreadsheet.
 * Also performs automatic self-healing migration from name-based reference to ID-based reference
 * if an older version of the spreadsheet is detected.
 */
function initializeDatabase(spreadsheetId) {
  var ss = getSpreadsheet(spreadsheetId);
  
  var activeEmail = '';
  try { activeEmail = Session.getActiveUser().getEmail(); } catch(e) {}
  var activeName = activeEmail ? activeEmail.split('@')[0] : '自分';
  
  // 1. Members sheet
  var memberSheet = ss.getSheetByName(SHEETS.MEMBERS);
  if (!memberSheet) {
    memberSheet = ss.insertSheet(SHEETS.MEMBERS);
    memberSheet.appendRow(['id', 'name', 'email', 'color']);
    
    // Seed default members: active user and one friend with static IDs
    memberSheet.appendRow(['mem_1', activeName, activeEmail || '', '#6366f1']); // Theme Indigo
    memberSheet.appendRow(['mem_2', '友人A', '', '#ec4899']); // Pink
  } else {
    // Self-healing migration: Convert older name-based member sheets to ID-based
    var headers = memberSheet.getRange(1, 1, 1, memberSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('id') === -1) {
      memberSheet.insertColumnBefore(1);
      memberSheet.getRange(1, 1).setValue('id');
      
      var numRows = memberSheet.getLastRow();
      var nameMap = {};
      if (numRows > 1) {
        for (var r = 2; r <= numRows; r++) {
          var memberId = 'mem_' + (r - 1);
          memberSheet.getRange(r, 1).setValue(memberId);
          var name = memberSheet.getRange(r, 2).getValue(); // Name shifts to column 2
          if (name) {
            nameMap[name] = memberId;
          }
        }
      }
      
      // Migrate Categories split_rules
      var categorySheet = ss.getSheetByName(SHEETS.CATEGORIES);
      if (categorySheet) {
        var catValues = categorySheet.getDataRange().getValues();
        var splitColIdx = catValues[0].indexOf('split_rules');
        if (splitColIdx !== -1) {
          for (var i = 1; i < catValues.length; i++) {
            var rulesStr = catValues[i][splitColIdx];
            if (rulesStr) {
              try {
                var rules = JSON.parse(rulesStr);
                var newRules = {};
                Object.keys(rules).forEach(function(key) {
                  var mappedKey = nameMap[key] || key;
                  newRules[mappedKey] = rules[key];
                });
                categorySheet.getRange(i + 1, splitColIdx + 1).setValue(JSON.stringify(newRules));
              } catch(e) {}
            }
          }
        }
      }
      
      // Migrate Expenses payer
      var expenseSheet = ss.getSheetByName(SHEETS.EXPENSES);
      if (expenseSheet) {
        var expValues = expenseSheet.getDataRange().getValues();
        var payerColIdx = expValues[0].indexOf('payer');
        if (payerColIdx !== -1) {
          for (var i = 1; i < expValues.length; i++) {
            var oldPayerName = expValues[i][payerColIdx];
            if (oldPayerName && nameMap[oldPayerName]) {
              expenseSheet.getRange(i + 1, payerColIdx + 1).setValue(nameMap[oldPayerName]);
            }
          }
        }
      }
      
      // Migrate Settlements settler
      var settlementSheet = ss.getSheetByName(SHEETS.SETTLEMENTS);
      if (settlementSheet) {
        var setValues = settlementSheet.getDataRange().getValues();
        var settlerColIdx = setValues[0].indexOf('settler');
        if (settlerColIdx !== -1) {
          for (var i = 1; i < setValues.length; i++) {
            var oldSettlerName = setValues[i][settlerColIdx];
            if (oldSettlerName && nameMap[oldSettlerName]) {
              settlementSheet.getRange(i + 1, settlerColIdx + 1).setValue(nameMap[oldSettlerName]);
            }
          }
        }
      }
    }
  }
  
  // 2. Categories sheet (Without savings reimbursement feature)
  var categorySheet = ss.getSheetByName(SHEETS.CATEGORIES);
  if (!categorySheet) {
    categorySheet = ss.insertSheet(SHEETS.CATEGORIES);
    categorySheet.appendRow(['id', 'name', 'emoji', 'split_rules']);
    
    // Seed default categories with equal split rules for 2 default member IDs
    var defaultSplit = {};
    defaultSplit['mem_1'] = 50;
    defaultSplit['mem_2'] = 50;
    var defaultSplitJson = JSON.stringify(defaultSplit);
    
    categorySheet.appendRow(['cat_1', '割り勘（均等）', '👥', defaultSplitJson]);
    categorySheet.appendRow(['cat_2', '食事・カフェ', '🍔', defaultSplitJson]);
    categorySheet.appendRow(['cat_3', '交通・移動費', '🚕', defaultSplitJson]);
  }
  
  // 3. Expenses sheet
  var expenseSheet = ss.getSheetByName(SHEETS.EXPENSES);
  if (!expenseSheet) {
    expenseSheet = ss.insertSheet(SHEETS.EXPENSES);
    expenseSheet.appendRow(['id', 'date', 'payer', 'amount', 'category', 'description', 'status', 'settlement_id', 'created_at']);
  }
  
  // 4. Settlements sheet
  var settlementSheet = ss.getSheetByName(SHEETS.SETTLEMENTS);
  if (!settlementSheet) {
    settlementSheet = ss.insertSheet(SHEETS.SETTLEMENTS);
    settlementSheet.appendRow(['id', 'date', 'settler', 'total_amount', 'details', 'created_at']);
  }
  
  return { success: true, message: 'Database initialized successfully.' };
}

/**
 * Get sheet headers and row data as array of objects.
 */
function getSheetData(spreadsheetId, sheetName) {
  var ss = getSpreadsheet(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    initializeDatabase(spreadsheetId);
    sheet = ss.getSheetByName(sheetName);
  }
  
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  var headers = values[0];
  var rows = [];
  
  for (var i = 1; i < values.length; i++) {
    var row = {};
    var hasData = false;
    for (var j = 0; j < headers.length; j++) {
      var val = values[i][j];
      // Stringify Date objects to prevent silent JSON serialization failures
      if (val instanceof Date) {
        val = val.toISOString();
      }
      row[headers[j]] = val;
      if (values[i][j] !== '') hasData = true;
    }
    if (hasData) {
      rows.push(row);
    }
  }
  return rows;
}

/**
 * Get all initial data required for the client application.
 */
function getInitialData(spreadsheetId) {
  try {
    if (!spreadsheetId) {
      return {
        success: false,
        onboarding: true,
        error: 'スプレッドシートIDが指定されていません。'
      };
    }
    
    initializeDatabase(spreadsheetId); // Self-heal database
    
    var email = '';
    try {
      email = Session.getActiveUser().getEmail();
    } catch (e) {}
    
    var members = getSheetData(spreadsheetId, SHEETS.MEMBERS);
    var activeMember = null;
    if (email) {
      for (var i = 0; i < members.length; i++) {
        if (members[i].email && members[i].email.toLowerCase().trim() === email.toLowerCase().trim()) {
          activeMember = members[i];
          break;
        }
      }
    }
    
    var displayName = activeMember ? activeMember.name : (email ? email.split('@')[0] : '自分');
    var displayColor = activeMember ? activeMember.color : '#6366f1';
    var displayId = activeMember ? activeMember.id : 'mem_1';
    
    var ss = getSpreadsheet(spreadsheetId);
    
    return {
      success: true,
      user: {
        email: email,
        name: displayName,
        color: displayColor,
        id: displayId,
        isAdmin: true
      },
      expenses: getSheetData(spreadsheetId, SHEETS.EXPENSES),
      settlements: getSheetData(spreadsheetId, SHEETS.SETTLEMENTS),
      members: members,
      categories: getSheetData(spreadsheetId, SHEETS.CATEGORIES),
      spreadsheetUrl: ss.getUrl(),
      spreadsheetName: ss.getName()
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Add a new expense record.
 */
function addExpense(spreadsheetId, expense) {
  try {
    var ss = getSpreadsheet(spreadsheetId);
    var sheet = ss.getSheetByName(SHEETS.EXPENSES);
    if (!sheet) {
      initializeDatabase(spreadsheetId);
      sheet = ss.getSheetByName(SHEETS.EXPENSES);
    }
    
    var id = 'exp_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 5);
    var createdAt = new Date().toISOString();
    
    sheet.appendRow([
      id,
      expense.date,
      sanitizeTextInput(expense.payer),
      Number(expense.amount),
      expense.category,
      sanitizeTextInput(expense.description || ''),
      'unsettled',
      '',
      createdAt
    ]);
    
    return { success: true, expenseId: id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete an expense record.
 */
function deleteExpense(spreadsheetId, id) {
  try {
    var ss = getSpreadsheet(spreadsheetId);
    var sheet = ss.getSheetByName(SHEETS.EXPENSES);
    if (!sheet) throw new Error('Expenses sheet does not exist.');
    
    var values = sheet.getDataRange().getValues();
    var idIndex = values[0].indexOf('id');
    
    if (idIndex === -1) throw new Error('ID column not found.');
    
    for (var i = 1; i < values.length; i++) {
      if (values[i][idIndex] === id) {
        sheet.deleteRow(i + 1); // 1-indexed and skip header
        return { success: true };
      }
    }
    throw new Error('経費データが見つかりませんでした。');
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update an existing expense record.
 */
function updateExpense(spreadsheetId, expense) {
  try {
    var ss = getSpreadsheet(spreadsheetId);
    var sheet = ss.getSheetByName(SHEETS.EXPENSES);
    if (!sheet) throw new Error('Expenses sheet does not exist.');
    
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    
    var idCol = headers.indexOf('id');
    var dateCol = headers.indexOf('date');
    var payerCol = headers.indexOf('payer');
    var amountCol = headers.indexOf('amount');
    var categoryCol = headers.indexOf('category');
    var descriptionCol = headers.indexOf('description');
    var statusCol = headers.indexOf('status');
    
    if (idCol === -1) throw new Error('ID column not found.');
    
    var foundRow = -1;
    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] === expense.id) {
        foundRow = i + 1; // 1-indexed and skip header
        break;
      }
    }
    
    if (foundRow === -1) throw new Error('経費データが見つかりませんでした。');
    
    // Check if settled to prevent editing settled expenses
    if (statusCol !== -1 && values[foundRow - 1][statusCol] === 'settled') {
      throw new Error('精算済みの立替費用は編集できません。');
    }
    
    if (dateCol !== -1) sheet.getRange(foundRow, dateCol + 1).setValue(expense.date);
    if (payerCol !== -1) sheet.getRange(foundRow, payerCol + 1).setValue(sanitizeTextInput(expense.payer));
    if (amountCol !== -1) sheet.getRange(foundRow, amountCol + 1).setValue(Number(expense.amount));
    if (categoryCol !== -1) sheet.getRange(foundRow, categoryCol + 1).setValue(expense.category);
    if (descriptionCol !== -1) sheet.getRange(foundRow, descriptionCol + 1).setValue(sanitizeTextInput(expense.description || ''));
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}


/**
 * Perform Settlement pairing and mark expenses as settled.
 */
function settleExpenses(spreadsheetId, settlerName, categoryIdOrName) {
  try {
    var ss = getSpreadsheet(spreadsheetId);
    var expenseSheet = ss.getSheetByName(SHEETS.EXPENSES);
    var settlementSheet = ss.getSheetByName(SHEETS.SETTLEMENTS);
    
    if (!expenseSheet || !settlementSheet) {
      initializeDatabase(spreadsheetId);
      expenseSheet = ss.getSheetByName(SHEETS.EXPENSES);
      settlementSheet = ss.getSheetByName(SHEETS.SETTLEMENTS);
    }
    
    var expenses = getSheetData(spreadsheetId, SHEETS.EXPENSES);
    var categories = getSheetData(spreadsheetId, SHEETS.CATEGORIES);
    var members = getSheetData(spreadsheetId, SHEETS.MEMBERS);
    
    var unsettled = expenses.filter(function(e) {
      var matchCat = true;
      if (categoryIdOrName) {
        matchCat = (e.category === categoryIdOrName);
      }
      return e.status === 'unsettled' && matchCat;
    });
    
    if (unsettled.length === 0) {
      throw new Error('精算対象の未精算データがありません。');
    }
    
    var totalAmount = unsettled.reduce(function(sum, e) {
      return sum + Number(e.amount);
    }, 0);
    
    var balances = {};
    members.forEach(function(m) {
      balances[m.id] = 0;
    });
    
    unsettled.forEach(function(e) {
      var amt = Number(e.amount);
      var payer = e.payer; // Now represents member ID
      
      // Find category by ID or Name
      var cat = categories.find(function(c) {
        return c.id === e.category || c.name === e.category;
      });
      
      var ratios = {};
      if (!cat) {
        // Fallback: Equal split if category not found
        members.forEach(function(m) {
          ratios[m.id] = 100 / members.length;
        });
      } else {
        // Normal split rule
        try {
          ratios = typeof cat.split_rules === 'string' ? JSON.parse(cat.split_rules) : cat.split_rules;
        } catch(err) {
          // equal split fallback
          members.forEach(function(m) {
            ratios[m.id] = 100 / members.length;
          });
        }
      }
      
      // Add full paid amount to payer's credit balance
      if (balances[payer] !== undefined) {
        balances[payer] += amt;
      }
      
      // Deduct each member's share
      members.forEach(function(m) {
        var ratio = Number(ratios[m.id]) || 0;
        var share = amt * (ratio / 100);
        if (balances[m.id] !== undefined) {
          balances[m.id] -= share;
        }
      });
    });
    
    var transfers = [];
    
    // Sort members into debtors (balance < 0) and creditors (balance > 0)
    var debtors = [];
    var creditors = [];
    
    members.forEach(function(m) {
      var bal = Math.round(balances[m.id]);
      if (bal < -0.1) {
        debtors.push({ id: m.id, amount: -bal });
      } else if (bal > 0.1) {
        creditors.push({ id: m.id, amount: bal });
      }
    });
    
    // Greedy matching algorithm for optimal transfers
    var debtIdx = 0;
    var credIdx = 0;
    while (debtIdx < debtors.length && credIdx < creditors.length) {
      var debtor = debtors[debtIdx];
      var creditor = creditors[credIdx];
      
      var transAmt = Math.min(debtor.amount, creditor.amount);
      if (transAmt > 0.1) {
        var debtorMember = members.find(function(m) { return m.id === debtor.id; });
        var creditorMember = members.find(function(m) { return m.id === creditor.id; });
        var dName = debtorMember ? debtorMember.name : debtor.id;
        var cName = creditorMember ? creditorMember.name : creditor.id;
        
        transfers.push(dName + ' ➔ ' + cName + ' : ' + Math.round(transAmt).toLocaleString() + '円');
      }
      
      debtor.amount -= transAmt;
      creditor.amount -= transAmt;
      
      if (debtor.amount < 0.1) debtIdx++;
      if (creditor.amount < 0.1) credIdx++;
    }
    
    var detailsText = transfers.join('\n');
    if (transfers.length === 0) {
      detailsText = '相殺により全員の支払額が均衡しています。送金の必要はありません。';
    }
    
    var categoryLabel = categoryIdOrName;
    var matchedCat = categories.find(function(c) { return c.id === categoryIdOrName || c.name === categoryIdOrName; });
    if (matchedCat) {
      categoryLabel = matchedCat.emoji + ' ' + matchedCat.name;
    }
    
    if (categoryIdOrName) {
      detailsText = '【精算対象：' + categoryLabel + '】\n' + detailsText;
    }
    
    // Record the settlement
    var settlementId = 'set_' + new Date().getTime();
    var nowStr = new Date().toISOString();
    
    var settlerDisplayName = settlerName || 'システム';
    var settlerMember = members.find(function(m) { return m.id === settlerName; });
    if (settlerMember) {
      settlerDisplayName = settlerMember.name;
    }
    
    settlementSheet.appendRow([
      settlementId,
      new Date().toLocaleDateString('ja-JP'),
      sanitizeTextInput(settlerDisplayName),
      totalAmount,
      sanitizeTextInput(detailsText),
      nowStr
    ]);
    
    // Update expenses statuses to settled
    var expenseValues = expenseSheet.getDataRange().getValues();
    var idColIdx = expenseValues[0].indexOf('id');
    var statusColIdx = expenseValues[0].indexOf('status');
    var settlementIdColIdx = expenseValues[0].indexOf('settlement_id');
    
    var unsettledIds = unsettled.map(function(e) { return e.id; });
    
    for (var i = 1; i < expenseValues.length; i++) {
      var rowId = expenseValues[i][idColIdx];
      if (unsettledIds.indexOf(rowId) !== -1) {
        expenseSheet.getRange(i + 1, statusColIdx + 1).setValue('settled');
        expenseSheet.getRange(i + 1, settlementIdColIdx + 1).setValue(settlementId);
      }
    }
    
    return {
      success: true,
      settlement: {
        id: settlementId,
        details: detailsText,
        totalAmount: totalAmount
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Save or update a category configuration.
 */
function saveCategory(spreadsheetId, category) {
  try {
    var ss = getSpreadsheet(spreadsheetId);
    var sheet = ss.getSheetByName(SHEETS.CATEGORIES);
    if (!sheet) {
      initializeDatabase(spreadsheetId);
      sheet = ss.getSheetByName(SHEETS.CATEGORIES);
    }
    
    var values = sheet.getDataRange().getValues();
    var idCol = values[0].indexOf('id');
    var nameCol = values[0].indexOf('name');
    var emojiCol = values[0].indexOf('emoji');
    var splitCol = values[0].indexOf('split_rules');
    
    var id = category.id;
    var isNew = !id;
    
    if (isNew) {
      id = 'cat_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 5);
      sheet.appendRow([
        id,
        sanitizeTextInput(category.name),
        sanitizeTextInput(category.emoji || '📂'),
        JSON.stringify(category.split_rules || {})
      ]);
    } else {
      var foundRow = -1;
      for (var i = 1; i < values.length; i++) {
        if (values[i][idCol] === id) {
          foundRow = i + 1; // 1-indexed and skip header
          break;
        }
      }
      if (foundRow === -1) throw new Error('カテゴリが見つかりませんでした。');
      
      sheet.getRange(foundRow, nameCol + 1).setValue(sanitizeTextInput(category.name));
      sheet.getRange(foundRow, emojiCol + 1).setValue(sanitizeTextInput(category.emoji || '📂'));
      sheet.getRange(foundRow, splitCol + 1).setValue(JSON.stringify(category.split_rules || {}));
    }
    
    return { success: true, id: id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete a category.
 */
function deleteCategory(spreadsheetId, id) {
  try {
    var ss = getSpreadsheet(spreadsheetId);
    var sheet = ss.getSheetByName(SHEETS.CATEGORIES);
    if (!sheet) throw new Error('Categories sheet does not exist.');
    
    var values = sheet.getDataRange().getValues();
    var idCol = values[0].indexOf('id');
    
    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] === id) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    throw new Error('カテゴリが見つかりませんでした。');
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Save all member settings including their unique ID.
 */
function saveMemberSettings(spreadsheetId, members) {
  try {
    var ss = getSpreadsheet(spreadsheetId);
    var sheet = ss.getSheetByName(SHEETS.MEMBERS);
    if (!sheet) {
      initializeDatabase(spreadsheetId);
      sheet = ss.getSheetByName(SHEETS.MEMBERS);
    }
    
    // Clear and rewrite sheet contents with ID column
    sheet.clearContents();
    sheet.getRange(1, 1, 1, 4).setValues([['id', 'name', 'email', 'color']]);
    
    for (var i = 0; i < members.length; i++) {
      sheet.appendRow([
        sanitizeTextInput(members[i].id || ('mem_' + (new Date().getTime() + i))),
        sanitizeTextInput(members[i].name),
        sanitizeTextInput(members[i].email || ''),
        members[i].color || '#6366f1'
      ]);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Create a new spreadsheet and initialize it.
 */
function createNewSpreadsheet(name) {
  try {
    var ss = SpreadsheetApp.create(name || "DivvPay 割り勘精算");
    var ssId = ss.getId();
    initializeDatabase(ssId);
    return {
      success: true,
      id: ssId,
      url: ss.getUrl(),
      name: ss.getName()
    };
  } catch (err) {
    return {
      success: false,
      error: "スプレッドシートの新規作成に失敗しました。\nエラー: " + err.message
    };
  }
}

