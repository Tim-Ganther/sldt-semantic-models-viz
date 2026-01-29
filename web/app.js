const elements = {
  statusText: document.getElementById("status-text"),
  modelList: document.getElementById("model-list"),
  modelCount: document.getElementById("model-count"),
  searchInput: document.getElementById("search-input"),
  viewerTitle: document.getElementById("viewer-title"),
  viewerMeta: document.getElementById("viewer-meta"),
  versionSelect: document.getElementById("version-select"),
  modelOverview: document.getElementById("model-overview"),
  attributeSearch: document.getElementById("attribute-search"),
  requiredOnly: document.getElementById("required-only"),
  attributesList: document.getElementById("attributes-list"),
  attributesMeta: document.getElementById("attributes-meta"),
  repoLink: document.getElementById("repo-link"),
  diffLink: document.getElementById("diff-link"),
};

let models = [];
let activeModel = null;
let activeVersion = null;
let attributes = [];
let attributeQuery = "";
let pendingAnchor = null;
let requiredOnly = false;
let activeSchema = null;
let activeExample = null;

const rawBase = "https://raw.githubusercontent.com/eclipse-tractusx/sldt-semantic-models/main/";
const ogImageUrl = `${window.location.origin}/assets/mindbehindit-og.webp`;
const baseTitle = "Aspect Models for Eclipse Tractus-X Semantic Layer (SLDT)";
const defaultMeta = {
  title: baseTitle,
  description:
    "Explore Aspect Models for the Eclipse Tractus-X Semantic Layer (SLDT) and align on shared data contracts.",
};

const titleCase = (value) =>
  value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const compareVersions = (a, b) => {
  const aParts = a.split(".").map((part) => Number(part));
  const bParts = b.split(".").map((part) => Number(part));
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i += 1) {
    const diff = (bParts[i] || 0) - (aParts[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const renderStatus = (message) => {
  elements.statusText.textContent = message;
};

const buildModels = (paths) => {
  const modelMap = new Map();
  paths
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .filter((path) => path.includes("/gen/"))
    .forEach((path) => {
      const [model, version, segment, file] = path.split("/");
      if (!model || !version || segment !== "gen" || !file) return;

      if (!modelMap.has(model)) {
        modelMap.set(model, {
          name: model,
          label: titleCase(model.split(".").slice(-1)[0] || model),
          versions: new Map(),
        });
      }
      const modelEntry = modelMap.get(model);
      if (!modelEntry.versions.has(version)) {
        modelEntry.versions.set(version, {
          version,
          htmlPath: null,
          schemaPath: null,
          examplePath: null,
        });
      }
      const versionEntry = modelEntry.versions.get(version);
      if (file.endsWith(".html")) {
        versionEntry.htmlPath = path;
      } else if (file.endsWith("-schema.json")) {
        versionEntry.schemaPath = path;
      } else if (file.endsWith(".json")) {
        versionEntry.examplePath = path;
      }
    });

  return Array.from(modelMap.values()).map((model) => ({
    ...model,
    versions: Array.from(model.versions.values())
      .filter((entry) => entry.htmlPath)
      .sort((a, b) => compareVersions(a.version, b.version)),
  }));
};

const resolveRef = (schema, ref) => {
  if (!ref || typeof ref !== "string") return null;
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) return null;
  const name = ref.slice(prefix.length);
  return schema.components?.schemas?.[name] || null;
};

const getExampleValue = (example, pathSegments) => {
  if (!example) return null;
  let current = example;
  for (const segment of pathSegments) {
    if (segment === "[]") {
      if (!Array.isArray(current) || current.length === 0) return null;
      current = current[0];
      continue;
    }
    if (current && typeof current === "object" && segment in current) {
      current = current[segment];
    } else {
      return null;
    }
  }
  return current;
};

const collectAttributes = (schema, node, path, isRequired, descriptionHint) => {
  if (!node) return [];
  if (node.$ref) {
    const resolved = resolveRef(schema, node.$ref);
    return collectAttributes(schema, resolved, path, isRequired, node.description || descriptionHint);
  }
  if (node.type === "array" && node.items) {
    return collectAttributes(schema, node.items, [...path, "[]"], isRequired, node.description || descriptionHint);
  }
  if (node.type === "object" || node.properties) {
    const requiredSet = new Set(node.required || []);
    return Object.entries(node.properties || {}).flatMap(([key, value]) =>
      collectAttributes(schema, value, [...path, key], requiredSet.has(key), value.description || descriptionHint)
    );
  }
  return [
    {
      path: path.join("."),
      description: node.description || descriptionHint || "",
      type: node.type || "",
      required: isRequired,
    },
  ];
};

const extractAttributes = (schema, example) => {
  const attributesList = collectAttributes(schema, schema, [], false, schema.description);
  return attributesList.map((attribute) => {
    const pathSegments = attribute.path.split(".").filter(Boolean);
    const exampleValue = getExampleValue(example, pathSegments);
    return {
      ...attribute,
      example: exampleValue,
    };
  });
};

const renderAttributes = (message) => {
  const query = attributeQuery.trim().toLowerCase();
  const filtered = attributes.filter((item) => {
    if (requiredOnly && !item.required) return false;
    if (!query) return true;
    return (
      item.path.toLowerCase().includes(query) ||
      (item.description || "").toLowerCase().includes(query)
    );
  });

  elements.attributesList.innerHTML = "";
  if (!filtered.length) {
    if (!attributes.length) {
      elements.attributesMeta.textContent = message || "No attributes available";
    } else {
      elements.attributesMeta.textContent = "0 attributes";
    }
    elements.attributesList.innerHTML =
      "<div class=\"empty-state\"><p>No matching attributes found.</p></div>";
    return;
  }

  elements.attributesMeta.textContent = `${filtered.length} attributes`;
  filtered.forEach((attribute) => {
    const item = document.createElement("div");
    const anchor = `attr-${attribute.path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    item.className = attribute.required ? "attribute-item required" : "attribute-item";
    item.id = anchor;
    const exampleValue =
      attribute.example === null || attribute.example === undefined
        ? "-"
        : typeof attribute.example === "object"
          ? JSON.stringify(attribute.example)
          : String(attribute.example);
    item.innerHTML = `
      <a class="attribute-link" href="#${anchor}">#</a>
      <p class="attribute-key">${attribute.path}</p>
      <p class="attribute-desc">${attribute.description || "No description provided."}</p>
      <div class="attribute-lines">
        <div class="attribute-line"><strong>Required</strong>${attribute.required ? "Yes" : "No"}</div>
        <div class="attribute-line"><strong>Type</strong>${attribute.type || "-"}</div>
        <div class="attribute-line"><strong>Example</strong>${exampleValue}</div>
      </div>
    `;
    elements.attributesList.appendChild(item);
  });

  if (pendingAnchor) {
    const target = document.getElementById(pendingAnchor);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      pendingAnchor = null;
    }
  }
};

const fetchJson = async (path) => {
  if (!path) return null;
  const response = await fetch(`${rawBase}${path}`);
  if (!response.ok) {
    throw new Error(`Fetch error: ${response.status}`);
  }
  return response.json();
};

const fetchHtml = async (path) => {
  if (!path) return null;
  const response = await fetch(`${rawBase}${path}`);
  if (!response.ok) {
    throw new Error(`Fetch error: ${response.status}`);
  }
  return response.text();
};

const setupDiagramPanZoom = (container) => {
  const stage = container.querySelector(".diagram-stage");
  if (!stage) return;
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const applyTransform = () => {
    stage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  };

  const onWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(scale * delta, 0.1);
    applyTransform();
  };

  const onPointerDown = (event) => {
    event.preventDefault();
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    translateX += event.clientX - lastX;
    translateY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    applyTransform();
  };

  const onPointerUp = (event) => {
    dragging = false;
    stage.releasePointerCapture(event.pointerId);
  };

  stage.style.transformOrigin = "center center";
  applyTransform();

  container.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointerleave", () => {
    dragging = false;
  });
};

const renderModelList = (filterValue = "") => {
  const query = filterValue.trim().toLowerCase();
  const filteredModels = query
    ? models.filter(
        (model) =>
          model.name.toLowerCase().includes(query) ||
          model.label.toLowerCase().includes(query)
      )
    : models;

  elements.modelList.innerHTML = "";
  filteredModels.forEach((model) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "model-card";
    if (activeModel && activeModel.name === model.name) {
      card.classList.add("active");
    }
    card.innerHTML = `<h3>${model.label}</h3>`;
    card.addEventListener("click", () => selectModel(model));
    elements.modelList.appendChild(card);
  });

  elements.modelCount.textContent = `${filteredModels.length} models`;
};

const updateViewer = () => {
  if (!activeModel || !activeVersion) return;
  const activeEntry = activeModel.versions.find((item) => item.version === activeVersion);
  if (!activeEntry) return;

  elements.viewerTitle.textContent = `${activeModel.label}`;
  elements.viewerMeta.textContent = `${activeModel.name} · Version ${activeVersion}`;
  const repoUrl = `https://github.com/eclipse-tractusx/sldt-semantic-models/tree/main/${activeModel.name}/${activeVersion}`;
  elements.repoLink.href = repoUrl;
  const targetVersion = activeModel.versions[0]?.version || activeVersion;
  elements.diffLink.href = `/diff?model=${encodeURIComponent(activeModel.name)}&from=${encodeURIComponent(activeVersion)}&to=${encodeURIComponent(targetVersion)}`;

  elements.modelOverview.innerHTML = "<div class=\"empty-state\"><p>Loading SAMM overview...</p></div>";
};

const updateMetaTag = (selector, value) => {
  const element = document.querySelector(selector);
  if (!element || !value) return;
  element.setAttribute("content", value);
};

const updateLinkTag = (selector, value) => {
  const element = document.querySelector(selector);
  if (!element || !value) return;
  element.setAttribute("href", value);
};

const buildMeta = () => {
  if (activeModel && activeVersion) {
    return {
      title: `${activeModel.name} v${activeVersion} | ${baseTitle}`,
      description: `Semantic model ${activeModel.name} version ${activeVersion}. Browse attributes, diagrams, and payload examples in the Eclipse Tractus-X Semantic Layer (SLDT).`,
    };
  }
  if (activeModel) {
    return {
      title: `${activeModel.name} | ${baseTitle}`,
      description: `Semantic model ${activeModel.name} in the Eclipse Tractus-X Semantic Layer (SLDT). Browse available versions, attributes, and diagrams.`,
    };
  }
  return defaultMeta;
};

const renderOverview = (schema, example) => {
  if (!schema) {
    elements.modelOverview.innerHTML =
      "<div class=\"empty-state\"><p>Overview not available.</p></div>";
    return;
  }

  const urn = schema["x-samm-aspect-model-urn"] || "-";
  const description = schema.description || "No description available.";
  const required = schema.required || [];
  const properties = Object.keys(schema.properties || {});
  const propertyCount = properties.length;
  const exampleText = example ? JSON.stringify(example, null, 2) : "-";

  elements.modelOverview.innerHTML = `
    <div>
      <h3 class="overview-title">Model overview</h3>
      <p class="overview-description">${description}</p>
    </div>
    <div class="overview-diagram">
      <p class="diagram-title">Model diagram</p>
      <div id="model-diagram" class="diagram-canvas" aria-label="Model diagram">
        <div class="empty-state"><p>Loading diagram...</p></div>
      </div>
    </div>
    <div class="overview-grid">
      <div class="overview-card">
        <h4>Aspect URN</h4>
        <p>${urn}</p>
      </div>
      <div class="overview-card">
        <h4>Properties</h4>
        <p>${propertyCount}</p>
      </div>
      <div class="overview-card">
        <h4>Required</h4>
        <p>${required.length ? required.join(", ") : "-"}</p>
      </div>
    </div>
    <details class="overview-details">
      <summary>Example payload</summary>
      <div class="overview-actions">
        <button type="button" id="download-full">Download full</button>
        <button type="button" id="download-minimal">Download minimal</button>
      </div>
      <pre class="overview-example">${exampleText}</pre>
    </details>
  `;
  wireDownloads();
};

const loadAttributes = async () => {
  if (!activeModel || !activeVersion) return;
  const activeEntry = activeModel.versions.find((item) => item.version === activeVersion);
  if (!activeEntry?.schemaPath) {
    attributes = [];
    activeSchema = null;
    activeExample = null;
    renderAttributes("No schema data available");
    renderOverview(null, null);
    loadDiagram(null);
    return;
  }

  elements.attributesMeta.textContent = "Loading attributes...";
  elements.attributesList.innerHTML =
    "<div class=\"empty-state\"><p>Loading attributes...</p></div>";

  try {
    const [schema, example] = await Promise.all([
      fetchJson(activeEntry.schemaPath),
      fetchJson(activeEntry.examplePath),
    ]);
    activeSchema = schema;
    activeExample = example;
    attributes = extractAttributes(schema, example);
    renderAttributes();
    renderOverview(schema, example);
    loadDiagram(activeEntry.htmlPath);
  } catch (error) {
    attributes = [];
    activeSchema = null;
    activeExample = null;
    renderAttributes("Unable to load attributes");
    renderOverview(null, null);
    loadDiagram(null);
  }
};

const resolveNode = (schema, node) => {
  if (!node) return null;
  if (node.$ref) {
    return resolveRef(schema, node.$ref) || node;
  }
  return node;
};

const buildMinimalPayload = (schema, node, example) => {
  const resolved = resolveNode(schema, node);
  if (!resolved) return null;
  if (resolved.type === "array" && resolved.items) {
    const itemExample = Array.isArray(example) ? example[0] : undefined;
    return [buildMinimalPayload(schema, resolved.items, itemExample)];
  }
  if (resolved.type === "object" || resolved.properties) {
    const requiredSet = new Set(resolved.required || []);
    const output = {};
    Object.entries(resolved.properties || {}).forEach(([key, value]) => {
      if (!requiredSet.has(key)) return;
      const exampleValue = example && typeof example === "object" ? example[key] : undefined;
      output[key] = buildMinimalPayload(schema, value, exampleValue);
    });
    return output;
  }
  if (example !== undefined) return example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum?.length) return resolved.enum[0];
  return null;
};


const downloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const wireDownloads = () => {
  const fullButton = document.getElementById("download-full");
  const minimalButton = document.getElementById("download-minimal");
  if (!fullButton || !minimalButton) return;

  fullButton.disabled = !activeExample;
  minimalButton.disabled = !activeSchema;

  fullButton.addEventListener("click", () => {
    if (!activeExample) return;
    const filename = `${activeModel?.name || "model"}-${activeVersion}-full.json`;
    downloadJson(activeExample, filename);
  });

  minimalButton.addEventListener("click", () => {
    if (!activeSchema) return;
    const minimal = buildMinimalPayload(activeSchema, activeSchema, activeExample);
    const filename = `${activeModel?.name || "model"}-${activeVersion}-minimal.json`;
    downloadJson(minimal, filename);
  });
};

const loadDiagram = async (htmlPath) => {
  const container = document.getElementById("model-diagram");
  if (!container) return;
  if (!htmlPath) {
    container.innerHTML = "<div class=\"empty-state\"><p>No diagram available.</p></div>";
    return;
  }

  container.innerHTML = "<div class=\"empty-state\"><p>Loading diagram...</p></div>";
  try {
    const html = await fetchHtml(htmlPath);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const diagram = doc.querySelector("#aspect-model-diagram");
    if (!diagram) {
      container.innerHTML = "<div class=\"empty-state\"><p>No diagram found.</p></div>";
      return;
    }
    const svg = diagram.querySelector("svg");
    const image = diagram.querySelector("img");
    if (svg) {
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      container.innerHTML = `<div class="diagram-stage">${svg.outerHTML}</div>`;
      setupDiagramPanZoom(container);
      return;
    }
    if (image) {
      const src = image.getAttribute("src") || "";
      container.innerHTML = `<div class="diagram-stage"><img src="${src}" alt="Model diagram" draggable="false" /></div>`;
      setupDiagramPanZoom(container);
      return;
    }
    container.innerHTML = "<div class=\"empty-state\"><p>No diagram found.</p></div>";
  } catch (error) {
    container.innerHTML = "<div class=\"empty-state\"><p>Diagram unavailable.</p></div>";
  }
};

const selectModel = (model) => {
  activeModel = model;
  activeVersion = model.versions[0]?.version || null;
  elements.versionSelect.disabled = !activeVersion;
  elements.versionSelect.innerHTML = "";
  attributeQuery = "";
  elements.attributeSearch.value = "";
  model.versions.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.version;
    option.textContent = entry.version;
    elements.versionSelect.appendChild(option);
  });
  if (activeVersion) {
    elements.versionSelect.value = activeVersion;
  }
  renderModelList(elements.searchInput.value);
  updateViewer();
  loadAttributes();
  updateUrl();
};

const selectVersion = (version) => {
  activeVersion = version;
  updateViewer();
  loadAttributes();
  updateUrl();
};

const fetchModels = async () => {
  const response = await fetch("/api/models");
  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }
  const data = await response.json();
  return buildModels(data.tree || []);
};

const buildPath = (model, version) => {
  if (!model) return "/";
  const modelPath = `/models/${encodeURIComponent(model)}`;
  if (!version) return modelPath;
  return `${modelPath}/versions/${encodeURIComponent(version)}`;
};

const updateUrl = () => {
  const url = new URL(window.location.href);
  url.pathname = buildPath(activeModel?.name, activeVersion);
  url.search = "";
  if (window.location.hash) {
    url.hash = window.location.hash;
  }
  window.history.replaceState({}, "", url);
  const meta = buildMeta();
  document.title = meta.title;
  updateMetaTag("meta[name=description]", meta.description);
  updateMetaTag("meta[property='og:title']", meta.title);
  updateMetaTag("meta[property='og:description']", meta.description);
  updateMetaTag("meta[property='og:url']", url.href);
  updateMetaTag("meta[property='og:image']", ogImageUrl);
  updateMetaTag("meta[name='twitter:title']", meta.title);
  updateMetaTag("meta[name='twitter:description']", meta.description);
  updateMetaTag("meta[name='twitter:image']", ogImageUrl);
  updateLinkTag("link[rel='canonical']", url.href);
};

const hydrateFromUrl = () => {
  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean);
  let model = null;
  let version = null;
  if (segments[0] === "models") {
    model = segments[1] ? decodeURIComponent(segments[1]) : null;
    if (segments[2] === "versions" && segments[3]) {
      version = decodeURIComponent(segments[3]);
    }
  } else {
    model = url.searchParams.get("model");
    version = url.searchParams.get("version");
  }
  const hash = url.hash.replace("#", "");
  if (hash) {
    pendingAnchor = hash;
  }
  if (!model) return false;
  const selected = models.find((item) => item.name === model);
  if (!selected) return false;
  selectModel(selected);
  if (version) {
    const exists = selected.versions.find((item) => item.version === version);
    if (exists) {
      elements.versionSelect.value = version;
      selectVersion(version);
    }
  }
  return true;
};

const init = async () => {
  try {
    renderStatus("Syncing models from GitHub...");
    models = (await fetchModels()).sort((a, b) => a.name.localeCompare(b.name));
    renderModelList();
    const hydrated = hydrateFromUrl();
    renderStatus(`${models.length} models available`);
    if (!hydrated) {
      updateUrl();
    }
  } catch (error) {
    renderStatus("Failed to load models");
    elements.modelList.innerHTML =
      "<p class=\"panel-meta\">Try again later or check server logs.</p>";
  }
};

elements.searchInput.addEventListener("input", (event) => {
  renderModelList(event.target.value);
});

elements.versionSelect.addEventListener("change", (event) => {
  selectVersion(event.target.value);
});

elements.attributeSearch.addEventListener("input", (event) => {
  attributeQuery = event.target.value;
  renderAttributes();
});

elements.requiredOnly.addEventListener("change", (event) => {
  requiredOnly = event.target.checked;
  renderAttributes();
});


window.addEventListener("hashchange", () => {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return;
  const target = document.getElementById(hash);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    pendingAnchor = hash;
  }
});

init();
