document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.getElementById("enabled");
  const statusEl = document.getElementById("status");

  function updateStatus(enabled) {
    statusEl.textContent = enabled
      ? "현재: 차단 기능이 켜져 있습니다."
      : "현재: 차단 기능이 꺼져 있습니다.";
  }

  chrome.storage.sync.get({ enabled: true }, (res) => {
    const enabled = !!res.enabled;
    checkbox.checked = enabled;
    updateStatus(enabled);
  });

  checkbox.addEventListener("change", () => {
    const enabled = checkbox.checked;
    chrome.storage.sync.set({ enabled });
    updateStatus(enabled);
  });
});