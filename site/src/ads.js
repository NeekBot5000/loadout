// The site's only ad: one display unit under the skill details on the catalog page.
// Nothing here runs unless config.js has an AdSense publisher ID and slot. When it does, the
// AdSense script loads once, only after the ad space scrolls into view, and the space is labelled.
// Consent in the EEA, UK and Switzerland: turn on Google's own consent message in AdSense
// (Privacy & messaging); it shows before any ad cookie is set, with no code here.
(function () {
  const cfg = window.LOADOUT_SITE || {};
  const client = /^ca-pub-\d{10,20}$/.test(cfg.adsenseClient || '') ? cfg.adsenseClient : '';
  const slot = /^\d{6,12}$/.test(cfg.adsenseSlot || '') ? cfg.adsenseSlot : '';
  let loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    document.head.appendChild(s);
  }

  window.loadoutAds = {
    enabled: !!(client && slot),
    mount(el) {
      if (!el || !client || !slot) return; // ads off: the slot stays hidden and empty
      el.hidden = false;
      el.innerHTML = `<p class="ad-label">Advertisement</p><ins class="adsbygoogle" data-ad-client="${client}" data-ad-slot="${slot}" data-ad-format="rectangle" data-full-width-responsive="true"></ins>`;
      const fill = () => { load(); (window.adsbygoogle = window.adsbygoogle || []).push({}); };
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); fill(); } });
        io.observe(el);
      } else fill();
    },
  };
})();
