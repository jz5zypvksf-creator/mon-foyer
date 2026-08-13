import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
let app = fs.readFileSync(appPath, 'utf8');

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`RC2.4.2 motif introuvable: ${label}`);
  return source.replace(from, to);
}

app = replaceOnce(
  app,
  "    recurringId: '',\n  };",
  "    recurringId: '',\n    structuredCommunication: '',\n    freeCommunication: '',\n    freeCommunicationMode: 'contains',\n  };",
  'draft belfius fields',
);

app = replaceOnce(
  app,
  "      structuredCommunication: existing?.structuredCommunication || existing?.structured_communication || '',\n      freeCommunication: existing?.freeCommunication || existing?.free_communication || '',\n      freeCommunicationMode: existing?.freeCommunicationMode || existing?.free_communication_mode || 'contains',",
  "      structuredCommunication: operation.structuredCommunication ?? existing?.structuredCommunication ?? existing?.structured_communication ?? '',\n      freeCommunication: operation.freeCommunication ?? existing?.freeCommunication ?? existing?.free_communication ?? '',\n      freeCommunicationMode: operation.freeCommunicationMode || existing?.freeCommunicationMode || existing?.free_communication_mode || 'contains',",
  'save operation belfius identifiers',
);

app = replaceOnce(
  app,
  "          recurringDay: draft.recurringDay,\n          recurringId: draft.recurringId,\n        });",
  "          recurringDay: draft.recurringDay,\n          recurringId: draft.recurringId,\n          structuredCommunication: draft.structuredCommunication || '',\n          freeCommunication: draft.freeCommunication || '',\n          freeCommunicationMode: draft.freeCommunicationMode || 'contains',\n        });",
  'pass belfius identifiers',
);

app = replaceOnce(
  app,
  "      recurringDay: recurringExpense?.day || Number(operation.date.slice(8, 10)),\n      recurringId: recurringExpense?.id || '',\n    });",
  "      recurringDay: recurringExpense?.day || Number(operation.date.slice(8, 10)),\n      recurringId: recurringExpense?.id || '',\n      structuredCommunication: recurringExpense?.structuredCommunication || recurringExpense?.structured_communication || '',\n      freeCommunication: recurringExpense?.freeCommunication || recurringExpense?.free_communication || '',\n      freeCommunicationMode: recurringExpense?.freeCommunicationMode || recurringExpense?.free_communication_mode || 'contains',\n    });",
  'load identifiers while editing',
);

const formAnchor = `                  {draft.recurrence !== 'once' && (\n                    <label>\n                      Jour habituel du prélèvement\n                      <input\n                        type=\"number\"\n                        min=\"1\"\n                        max=\"31\"\n                        value={draft.recurringDay}\n                        onChange={(event) => setDraft({ ...draft, recurringDay: event.target.value })}\n                      />\n                    </label>\n                  )}`;

const formReplacement = `${formAnchor}\n                  {draft.recurrence !== 'once' && (\n                    <div className=\"belfius-identification-inline\">\n                      <div className=\"belfius-identification-title\">Identification Belfius <span>(facultatif)</span></div>\n                      <label>\n                        Communication structurée\n                        <input\n                          value={draft.structuredCommunication || ''}\n                          onChange={(event) => setDraft({ ...draft, structuredCommunication: event.target.value })}\n                          placeholder=\"Ex. 827-6921515-21 ou +++123/4567/89012+++\"\n                        />\n                      </label>\n                      <div className=\"form-row\">\n                        <label>\n                          Communication libre / motif Belfius\n                          <input\n                            value={draft.freeCommunication || ''}\n                            onChange={(event) => setDraft({ ...draft, freeCommunication: event.target.value })}\n                            placeholder=\"Ex. Pension, Pour voiture…\"\n                          />\n                        </label>\n                        <label>\n                          Règle de reconnaissance\n                          <select\n                            value={draft.freeCommunicationMode || 'contains'}\n                            onChange={(event) => setDraft({ ...draft, freeCommunicationMode: event.target.value })}\n                          >\n                            <option value=\"contains\">Contient</option>\n                            <option value=\"exact\">Correspond exactement</option>\n                          </select>\n                        </label>\n                      </div>\n                      <p className=\"hint\">Ces informations sont enregistrées sur le paiement récurrent associé et servent au rapprochement bancaire.</p>\n                    </div>\n                  )}`;

app = replaceOnce(app, formAnchor, formReplacement, 'operation identification form');

fs.writeFileSync(appPath, app);
console.log('RC2.4.2 appliquée : identification Belfius modifiable depuis l’historique.');
