import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const auditPath = new URL('../src/BelfiusAudit.jsx', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');
let audit = fs.readFileSync(auditPath, 'utf8');

function replaceAllRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`RC2.4.1 motif introuvable: ${label}`);
  return source.split(from).join(to);
}
function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`RC2.4.1 motif introuvable: ${label}`);
  return source.replace(from, to);
}

// --- App.jsx : modèle et persistance Supabase ---
app = replaceOnce(
  app,
  "    structuredCommunication: '',\n  };",
  "    structuredCommunication: '',\n    freeCommunication: '',\n    freeCommunicationMode: 'contains',\n  };",
  'draft communications',
);

app = replaceOnce(
  app,
  "      startDate: expense.start_date || currentDate(),\n    })),",
  "      startDate: expense.start_date || currentDate(),\n      structuredCommunication: expense.structured_communication || '',\n      freeCommunication: expense.free_communication || '',\n      freeCommunicationMode: expense.free_communication_mode || 'contains',\n    })),",
  'normalize recurring communications',
);

app = replaceAllRequired(
  app,
  ".select('id, label, amount, day, person, category, frequency, start_date')",
  ".select('id, label, amount, day, person, category, frequency, start_date, structured_communication, free_communication, free_communication_mode')",
  'recurring selects',
);

app = replaceOnce(
  app,
  "      category: expense.category || 'habitation',\n    });",
  "      category: expense.category || 'habitation',\n      structuredCommunication: expense.structuredCommunication || expense.structured_communication || '',\n      freeCommunication: expense.freeCommunication || expense.free_communication || '',\n      freeCommunicationMode: expense.freeCommunicationMode || expense.free_communication_mode || 'contains',\n    });",
  'edit recurring communications',
);

app = replaceOnce(
  app,
  "      startDate: recurringDraft.startDate || currentDate(),\n    };",
  "      startDate: recurringDraft.startDate || currentDate(),\n      structuredCommunication: String(recurringDraft.structuredCommunication || '').trim(),\n      freeCommunication: String(recurringDraft.freeCommunication || '').trim(),\n      freeCommunicationMode: recurringDraft.freeCommunicationMode || 'contains',\n    };",
  'fixed expense communications',
);

app = replaceOnce(
  app,
  "        start_date: fixedExpense.startDate,\n      };",
  "        start_date: fixedExpense.startDate,\n        structured_communication: fixedExpense.structuredCommunication || null,\n        free_communication: fixedExpense.freeCommunication || null,\n        free_communication_mode: fixedExpense.freeCommunicationMode || 'contains',\n      };",
  'payload communications',
);

app = replaceOnce(
  app,
  "        startDate: savedExpense.start_date || currentDate(),\n      };",
  "        startDate: savedExpense.start_date || currentDate(),\n        structuredCommunication: savedExpense.structured_communication || '',\n        freeCommunication: savedExpense.free_communication || '',\n        freeCommunicationMode: savedExpense.free_communication_mode || 'contains',\n      };",
  'saved communications',
);

// Realtime mapping needs camelCase too.
app = replaceOnce(
  app,
  "              day: Number(expense.day),\n            })),",
  "              day: Number(expense.day),\n              structuredCommunication: expense.structured_communication || '',\n              freeCommunication: expense.free_communication || '',\n              freeCommunicationMode: expense.free_communication_mode || 'contains',\n            })),",
  'realtime communications',
);

// Add operation-generated recurring items get safe empty banking identification fields.
app = replaceOnce(
  app,
  "      startDate: operation.date,\n    };",
  "      startDate: operation.date,\n      structuredCommunication: existing?.structuredCommunication || existing?.structured_communication || '',\n      freeCommunication: existing?.freeCommunication || existing?.free_communication || '',\n      freeCommunicationMode: existing?.freeCommunicationMode || existing?.free_communication_mode || 'contains',\n    };",
  'operation recurring communications',
);
app = replaceOnce(
  app,
  "        start_date: recurringExpense.startDate,\n      };",
  "        start_date: recurringExpense.startDate,\n        structured_communication: recurringExpense.structuredCommunication || null,\n        free_communication: recurringExpense.freeCommunication || null,\n        free_communication_mode: recurringExpense.freeCommunicationMode || 'contains',\n      };",
  'operation recurring payload',
);

// UI: complete the existing structured communication field with free communication + matching rule.
app = replaceOnce(
  app,
  `                <label>\n                  Communication structurée (facultative)\n                  <input\n                    value={recurringDraft.structuredCommunication || ''}\n                    onChange={(event) => setRecurringDraft({ ...recurringDraft, structuredCommunication: event.target.value })}\n                    placeholder="+++123/4567/89012+++"\n                  />\n                </label>`,
  `                <fieldset className="recurring-bank-identification">\n                  <legend>Identification Belfius (facultatif)</legend>\n                  <label>\n                    Communication structurée\n                    <input\n                      value={recurringDraft.structuredCommunication || ''}\n                      onChange={(event) => setRecurringDraft({ ...recurringDraft, structuredCommunication: event.target.value })}\n                      placeholder="+++123/4567/89012+++"\n                    />\n                  </label>\n                  <label>\n                    Communication libre / motif Belfius\n                    <input\n                      value={recurringDraft.freeCommunication || ''}\n                      onChange={(event) => setRecurringDraft({ ...recurringDraft, freeCommunication: event.target.value })}\n                      placeholder="Ex. Pension, Pour voiture, POL. DROIT COM..."\n                    />\n                  </label>\n                  <label>\n                    Règle de reconnaissance\n                    <select\n                      value={recurringDraft.freeCommunicationMode || 'contains'}\n                      onChange={(event) => setRecurringDraft({ ...recurringDraft, freeCommunicationMode: event.target.value })}\n                    >\n                      <option value="contains">La communication Belfius contient ce texte</option>\n                      <option value="exact">La communication Belfius correspond exactement</option>\n                    </select>\n                  </label>\n                </fieldset>`,
  'recurring banking UI',
);

// --- BelfiusAudit.jsx : communication libre comme preuve forte ---
if (!audit.includes('function recurringFreeCommunicationMatch')) {
  audit = replaceOnce(
    audit,
    "function recurringBelongsToAppRow(expense, appRow) {",
    `function recurringFreeCommunicationMatch(bankRow, expense) {\n  const expected = normalize(expense?.freeCommunication || expense?.free_communication || '');\n  if (!expected) return false;\n  const actual = normalize(bankRow?.communication || bankRow?.details || '');\n  if (!actual) return false;\n  const mode = expense?.freeCommunicationMode || expense?.free_communication_mode || 'contains';\n  return mode === 'exact' ? actual === expected : actual.includes(expected);\n}\n\nfunction recurringBelongsToAppRow(expense, appRow) {`,
    'free communication helper',
  );
}

audit = replaceOnce(
  audit,
  "    if (exactCommunication) return { ...exactCommunication, __communicationMatch: true };\n  }\n  return candidates[0] || null;",
  "    if (exactCommunication) return { ...exactCommunication, __communicationMatch: true };\n  }\n  const freeCommunication = candidates.find((expense) => recurringFreeCommunicationMatch(bankRow, expense));\n  if (freeCommunication) return { ...freeCommunication, __freeCommunicationMatch: true };\n  return candidates[0] || null;",
  'free communication recurring match',
);

audit = replaceOnce(
  audit,
  "  if (recurring && recurring.__communicationMatch) {",
  `  if (recurring && recurring.__freeCommunicationMatch) {\n    return {\n      auto: true,\n      confidence: 100,\n      reason: \`Communication libre Belfius reconnue + frais récurrent : ${'${'}recurring.label}\`,\n      recurring,\n    };\n  }\n  if (recurring && recurring.__communicationMatch) {`,
  'free communication evidence',
);

// Wording becomes generic banking identification rather than OCR-only.
audit = audit.replace(
  "reason: `Communication structurée + frais récurrent : ${recurring.label}`",
  "reason: `Communication structurée Belfius + frais récurrent : ${recurring.label}`",
);

fs.writeFileSync(appPath, app);
fs.writeFileSync(auditPath, audit);
console.log('RC2.4.1 appliquée: communications structurées/libres persistées et utilisées par le rapprochement.');
