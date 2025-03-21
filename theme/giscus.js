var giscus = function () {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://giscus.app/client.js";
    
    script.setAttribute("data-repo", "han-rs/twir.han.rs");
    script.setAttribute("data-repo-id", "R_kgDOOMEJsg");
    script.setAttribute("data-category", "章节评论区");
    script.setAttribute("data-category-id", "DIC_kwDOOMEJss4CoUhq");
  
    script.setAttribute("data-mapping", "title");
    script.setAttribute("data-term", "0");
    script.setAttribute("data-reactions-enabled", "1");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "top");
    script.setAttribute("data-theme", "preferred_color_scheme");
    script.setAttribute("data-lang", "zh-CN");
    script.setAttribute("data-loading", "lazy");
  
    script.crossOrigin = "anonymous";
    script.async = true;
    document.getElementById("giscus-container").appendChild(script);
  };

window.addEventListener('load', giscus);
