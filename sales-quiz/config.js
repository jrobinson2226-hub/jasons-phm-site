// Sales Meeting Quiz settings.
// Fill these in from the Google Form + its response Sheet (see README in this folder).
window.QUIZ_CONFIG = {
  // Google Form "formResponse" URL, e.g. https://docs.google.com/forms/d/e/XXXX/formResponse
  formAction: '',
  // Entry IDs for the three short-answer questions (Name, Score, Time)
  entryName: '',
  entryScore: '',
  entryTime: '',
  // ID of the Google Sheet linked to the form (shared "Anyone with the link can view")
  sheetId: '',
  // Start counting results after this moment (ISO time). Change it to reset the leaderboard.
  resultsSince: '2026-11-01T00:00:00-06:00'
};
