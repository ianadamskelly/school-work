"use client";

import { useState } from "react";

export function EvidenceInput() {
  const [error, setError] = useState("");
  return <div className="min-w-0"><input name="evidence" type="file" accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" className="mt-3 block w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => {
    const file = event.currentTarget.files?.[0];
    const message = file && file.size > 10 * 1024 * 1024 ? "File must be 10 MB or smaller." : file && !/\.(png|jpe?g|pdf|docx?)$/i.test(file.name) ? "Choose PNG, JPG, PDF, DOC or DOCX." : "";
    event.currentTarget.setCustomValidity(message);
    setError(message);
  }} />{error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}</div>;
}
