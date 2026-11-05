// Sales Meeting Quiz settings.
// Fill these in from the Google Form + its response Sheet (see README in this folder).
window.QUIZ_CONFIG = {
  // Google Form "formResponse" URL, e.g. https://docs.google.com/forms/d/e/XXXX/formResponse
  formAction: 'https://docs.google.com/forms/d/e/1FAIpQLScZY7ju-VdnOUfGAMbyLMkoAbximshxoLHFT9uwULwMoBB2oQ/formResponse',
  // Entry IDs for the three short-answer questions (Name, Score, Time)
  entryName: 'entry.490818390',
  entryScore: 'entry.2109580967',
  entryTime: 'entry.926661985',
  // ID of the Google Sheet linked to the form (shared "Anyone with the link can view")
  sheetId: '17P_Eruvr8TNLR-JQGbCptfVVZMKMQ48ce-Q7kiDwet4',
  // Start counting results after this moment (ISO time). Change it to reset the leaderboard.
  resultsSince: '2026-11-01T00:00:00-06:00'
};
