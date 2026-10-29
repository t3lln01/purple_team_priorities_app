document.getElementById("import-browser")?.addEventListener("click", async function () {
  const status = document.getElementById("import-status");
  this.disabled = true;
  try {
    const payload = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!/^(pt_|ds_)/.test(key) || /credential|secret|token|password/i.test(key)) continue;
      const raw = localStorage.getItem(key);
      try { payload[key] = JSON.parse(raw); } catch (_) { payload[key] = raw; }
    }
    const response = await fetch("/api/browser-import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": document.querySelector("[name=csrfmiddlewaretoken]").value },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Import failed.");
    status.textContent = `Imported ${result.imported} settings. Existing server settings and original browser data were preserved.`;
  } catch (error) { status.textContent = error.message; }
  finally { this.disabled = false; }
});
