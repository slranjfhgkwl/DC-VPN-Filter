let gEnabled = true;
let gIpDb = null;
let gIpDbReady = false;
let gObserver = null;

const VPN_EXCLUDE_LABELS = [
  "미꾸라지(정확도 낮음)",
  "구글크롬 프록시",
  "브이랜24",
  "브이토피아",
  "비공릴",
  "KT",
  "SKB",
  "LGU+"
];

async function ensureIpDb() {
  if (gIpDbReady && gIpDb) return true;
  if (gIpDbReady && !gIpDb) return false;

  try {
    const url = chrome.runtime.getURL("ip.json");
    const resp = await fetch(url);

    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }

    const data = await resp.json();

    if (
      !data ||
      typeof data !== "object" ||
      Object.keys(data).length === 0
    ) {
      console.error(
        "[DC VPN Guest Filter] ip.json이 비어 있습니다. 필터를 비활성화합니다."
      );

      gIpDb = null;
      gIpDbReady = true;
      return false;
    }

    gIpDb = data;
    gIpDbReady = true;

    console.log(
      "[DC VPN Guest Filter] ip.json 로드 완료. prefix 개수:",
      Object.keys(gIpDb).length
    );

    return true;
  } catch (e) {
    console.error(
      "[DC VPN Guest Filter] ip.json 로드 실패. 필터를 비활성화합니다.",
      e
    );

    gIpDb = null;
    gIpDbReady = true;
    return false;
  }
}

function getIpInfoFromDb(ip) {
  if (!gIpDb) return null;

  const m = /^(\d+\.\d+)/.exec(ip);

  if (!m) return null;

  const prefix = m[1];

  return gIpDb[prefix] || null;
}

function classifyIp(ip) {
  if (!gIpDbReady || !gIpDb) {
    return {
      hasInfo: true,
      isVpn: false,
      info: null
    };
  }

  const info = getIpInfoFromDb(ip);

  if (!info) {

    return {
      hasInfo: false,
      isVpn: false,
      info: null
    };
  }

  const raw = String(info).trim();


  if (
    VPN_EXCLUDE_LABELS.some((label) => raw.includes(label))
  ) {
    return {
      hasInfo: true,
      isVpn: false,
      info: raw
    };
  }

  const containsVpn =
    raw.includes("VPN") ||
    raw.includes("프록시") ||
    /proxy/i.test(raw);

  return {
    hasInfo: true,
    isVpn: containsVpn,
    info: raw
  };
}

function isGuestWriter(el) {
  const uid =
    el.dataset.uid ||
    el.getAttribute("data-uid") ||
    "";

  const ip =
    el.dataset.ip ||
    el.getAttribute("data-ip") ||
    "";

  return !!ip && !uid;
}



function hideByWriterElement(writerEl) {
  if (!writerEl) return;


  if (writerEl.dataset.dcvpnHidden === "1") {
    return;
  }

  let container =
    writerEl.closest(".ub-content") ||
    writerEl.closest(".reply") ||
    writerEl.closest(".cmt_info") ||
    writerEl.closest(".reply_info");

  if (!container) {
    container = writerEl;
  }


  container.dataset.dcvpnOriginalDisplay =
    container.style.display;

  container.style.display = "none";

  container.dataset.dcvpnHidden = "1";
}



function restoreHiddenElements() {
  document
    .querySelectorAll('[data-dcvpn-hidden="1"]')
    .forEach((container) => {

      const originalDisplay =
        container.dataset.dcvpnOriginalDisplay;

      if (originalDisplay !== undefined) {
        container.style.display = originalDisplay;
      } else {
        container.style.removeProperty("display");
      }


      delete container.dataset.dcvpnHidden;
      delete container.dataset.dcvpnOriginalDisplay;
    });

 
  document
    .querySelectorAll('[data-dcvpn-processed="1"]')
    .forEach((writerEl) => {
      delete writerEl.dataset.dcvpnProcessed;
    });
}


async function processWriterElement(writerEl) {
  if (!gEnabled) return;

  if (!(writerEl instanceof HTMLElement)) return;

  if (writerEl.dataset.dcvpnProcessed === "1") {
    return;
  }


  if (!isGuestWriter(writerEl)) {
    return;
  }

  const ip =
    writerEl.dataset.ip ||
    writerEl.getAttribute("data-ip");

  if (!ip) {
    return;
  }

  const ok = await ensureIpDb();

  if (!ok) {
    return;
  }


  writerEl.dataset.dcvpnProcessed = "1";

  const {
    hasInfo,
    isVpn
  } = classifyIp(ip);


  if (isVpn || !hasInfo) {
    hideByWriterElement(writerEl);
  }
}


function scanExistingWriters() {
  document
    .querySelectorAll(".ub-writer")
    .forEach((el) => {
      processWriterElement(el);
    });
}


function startObserver() {
  if (gObserver || !document.body) {
    return;
  }

  gObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        if (node.matches(".ub-writer")) {
          processWriterElement(node);
        } else {
          const writers =
            node.querySelectorAll?.(".ub-writer");

          if (writers && writers.length) {
            writers.forEach((el) => {
              processWriterElement(el);
            });
          }
        }
      }
    }
  });

  gObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}


function stopObserver() {
  if (gObserver) {
    gObserver.disconnect();
    gObserver = null;
  }
}



function applyEnabled(enabled) {
  gEnabled = enabled;

  if (gEnabled) {
    
    scanExistingWriters();
    startObserver();
  } else {
    
    stopObserver();
    restoreHiddenElements();
  }
}


(function init() {
  chrome.storage.sync.get(
    { enabled: true },
    (res) => {
      applyEnabled(!!res.enabled);
    }
  );

  chrome.storage.onChanged.addListener(
    (changes, area) => {
      if (
        area === "sync" &&
        changes.enabled
      ) {
        applyEnabled(
          !!changes.enabled.newValue
        );
      }
    }
  );
})();
