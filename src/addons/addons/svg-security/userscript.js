// SVG Security Sandbox - DEPRECATED
// SVG security features have been integrated into the core upload pipeline.
// This addon is no longer needed.

export default async function ({ addon, console }) {
  console.log("[SVG Security] This addon is deprecated. SVG security features are now integrated into the core upload pipeline.");
  
  // 保留 processSvgInSandbox 供其他可能依赖它的插件使用
  let sandboxIframe = null;

  const getSandboxBody = () => {
    if (!sandboxIframe) {
      sandboxIframe = document.createElement("iframe");
      sandboxIframe.className = "svg-security-sandbox";
      sandboxIframe.sandbox = "allow-same-origin";
      sandboxIframe.style.position = "absolute";
      sandboxIframe.style.top = "-10000px";
      sandboxIframe.style.left = "-10000px";
      sandboxIframe.style.width = "0";
      sandboxIframe.style.height = "0";
      sandboxIframe.style.opacity = "0";
      sandboxIframe.style.visibility = "hidden";
      sandboxIframe.style.pointerEvents = "none";
      sandboxIframe.tabIndex = -1;
      if (sandboxIframe.setAttribute) {
        sandboxIframe.setAttribute("aria-hidden", "true");
      }
      document.body.appendChild(sandboxIframe);

      const doc = sandboxIframe.contentDocument;
      doc.open();
      doc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\' data:; font-src data:; img-src data:">' +
        "</head><body></body></html>"
      );
      doc.close();
    }
    return sandboxIframe.contentDocument.body;
  };

  const processSvgInSandbox = (svgString) => {
    try {
      const sandboxBody = getSandboxBody();
      const wrapper = document.createElement("div");
      wrapper.innerHTML = svgString;
      const svgEl = wrapper.querySelector("svg");
      if (!svgEl) return null;
      sandboxBody.appendChild(wrapper);
      const bbox = svgEl.getBBox();
      sandboxBody.removeChild(wrapper);
      return { width: bbox.width, height: bbox.height, x: bbox.x, y: bbox.y };
    } catch (e) {
      try {
        console.warn("SVG Security: sandbox processing failed", e);
      } catch (e2) { /* ignore */ }
      return null;
    }
  };

  return {
    processSvgInSandbox,
  };
}
