import { api } from "./operationsApi";

export async function fetchAcceptanceSheets(projectId) {
  return api(`/api/acceptance-sheets?projectId=${encodeURIComponent(projectId)}`);
}

export async function fetchAcceptanceSheetDetail(sheetId) {
  return api(`/api/acceptance-sheets/${encodeURIComponent(sheetId)}`);
}

export async function fetchSheetPreparationData(projectId) {
  return api(`/api/acceptance-sheets/prepare?projectId=${encodeURIComponent(projectId)}`);
}

export async function createAcceptanceSheet(sheetData) {
  return api(`/api/acceptance-sheets`, {
    method: "POST",
    body: sheetData,
  });
}
