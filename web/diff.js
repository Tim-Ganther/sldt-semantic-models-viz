const diffElements = {
  status: document.getElementById("diff-status"),
  modelSelect: document.getElementById("diff-model"),
  fromSelect: document.getElementById("diff-from"),
  toSelect: document.getElementById("diff-to"),
  runButton: document.getElementById("diff-run"),
  summary: document.getElementById("diff-summary"),
  side: document.getElementById("diff-side"),
  tabs: document.querySelectorAll(".diff-tab"),
};

const rawBase = "https://raw.githubusercontent.com/eclipse-tractusx/sldt-semantic-models/main/";

let models = [];
let attributeCache = new Map();

const renderStatus = (message) => {
  diffElements.status.textContent = message;
};

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

const titleCase = (value) =>
  value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const buildModels = (paths) => {
  const modelMap = new Map();
  paths
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .filter((path) => path.includes("/gen/") || path.endsWith(".ttl"))
    .forEach((path) => {
      const [model, version, segment, file] = path.split("/");
      if (!model || !version || !file) return;

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
          schemaPath: null,
          examplePath: null,
          ttlPath: null,
        });
      }
      const versionEntry = modelEntry.versions.get(version);
      if (file.endsWith("-schema.json")) {
        versionEntry.schemaPath = path;
      } else if (file.endsWith(".json")) {
        versionEntry.examplePath = path;
      } else if (file.endsWith(".ttl")) {
        versionEntry.ttlPath = path;
      }
    });

  return Array.from(modelMap.values()).map((model) => ({
    ...model,
    versions: Array.from(model.versions.values())
      .filter((entry) => entry.schemaPath)
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

const extractAttributes = (schema) => collectAttributes(schema, schema, [], false, schema.description);

const fetchJson = async (path) => {
  if (!path) return null;
  const response = await fetch(`${rawBase}${path}`);
  if (!response.ok) {
    throw new Error(`Fetch error: ${response.status}`);
  }
  return response.json();
};

const fetchText = async (path) => {
  if (!path) return null;
  const response = await fetch(`${rawBase}${path}`);
  if (!response.ok) {
    throw new Error(`Fetch error: ${response.status}`);
  }
  return response.text();
};

const getAttributesForVersion = async (model, version) => {
  const cacheKey = `${model.name}@${version}`;
  if (attributeCache.has(cacheKey)) {
    return attributeCache.get(cacheKey);
  }
  const entry = model.versions.find((item) => item.version === version);
  if (!entry?.schemaPath) return [];
  const schema = await fetchJson(entry.schemaPath);
  const attrs = extractAttributes(schema);
  attributeCache.set(cacheKey, attrs);
  return attrs;
};

const getSourceForVersion = async (model, version) => {
  const entry = model.versions.find((item) => item.version === version);
  if (!entry) return { title: "", lines: [] };
  if (entry.ttlPath) {
    const ttl = await fetchText(entry.ttlPath);
    return { title: "SAMM (.ttl)", lines: ttl.split("\n") };
  }
  if (entry.schemaPath) {
    const schema = await fetchJson(entry.schemaPath);
    const json = JSON.stringify(schema, null, 2);
    return { title: "Schema (.json)", lines: json.split("\n") };
  }
  return { title: "", lines: [] };
};

const buildDiff = (fromAttrs, toAttrs) => {
  const fromMap = new Map(fromAttrs.map((item) => [item.path, item]));
  const toMap = new Map(toAttrs.map((item) => [item.path, item]));
  const allPaths = new Set([...fromMap.keys(), ...toMap.keys()]);
  const diffItems = [];

  allPaths.forEach((path) => {
    const fromItem = fromMap.get(path);
    const toItem = toMap.get(path);
    if (!fromItem && toItem) {
      diffItems.push({ path, status: "added", from: null, to: toItem });
      return;
    }
    if (fromItem && !toItem) {
      diffItems.push({ path, status: "removed", from: fromItem, to: null });
      return;
    }
    const changed =
      fromItem.description !== toItem.description ||
      fromItem.type !== toItem.type ||
      fromItem.required !== toItem.required;
    if (changed) {
      diffItems.push({ path, status: "changed", from: fromItem, to: toItem });
    }
  });

  return diffItems.sort((a, b) => a.path.localeCompare(b.path));
};

const renderSummary = (diffItems) => {
  diffElements.summary.innerHTML = "";
  if (!diffItems.length) {
    diffElements.summary.innerHTML = "<div class=\"empty-state\"><p>No differences found.</p></div>";
    return;
  }
  diffItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = `diff-item diff-${item.status}`;
    row.innerHTML = `
      <div>
        <p class="diff-path">${item.path}</p>
        <p class="diff-status">${item.status}</p>
      </div>
      <div class="diff-grid">
        <div>
          <p class="diff-label">From</p>
          <p class="diff-value">${item.from ? `${item.from.type || "-"} · ${item.from.required ? "Required" : "Optional"}` : "-"}</p>
          <p class="diff-desc">${item.from?.description || "-"}</p>
        </div>
        <div>
          <p class="diff-label">To</p>
          <p class="diff-value">${item.to ? `${item.to.type || "-"} · ${item.to.required ? "Required" : "Optional"}` : "-"}</p>
          <p class="diff-desc">${item.to?.description || "-"}</p>
        </div>
      </div>
    `;
    diffElements.summary.appendChild(row);
  });
};

const renderSide = (fromSource, toSource, fromVersion, toVersion) => {
  diffElements.side.innerHTML = "";
  if (!fromSource.lines.length && !toSource.lines.length) {
    diffElements.side.innerHTML = "<div class=\"empty-state\"><p>No sources found.</p></div>";
    return;
  }

  const maxLines = Math.max(fromSource.lines.length, toSource.lines.length);
  const container = document.createElement("div");
  container.className = "diff-code";
  container.innerHTML = `
    <div class="diff-code-header">
      <div>
        <p class="diff-label">${fromVersion} · ${fromSource.title}</p>
      </div>
      <div>
        <p class="diff-label">${toVersion} · ${toSource.title}</p>
      </div>
    </div>
    <div class="diff-code-grid"></div>
  `;
  const grid = container.querySelector(".diff-code-grid");

  for (let i = 0; i < maxLines; i += 1) {
    const fromLine = fromSource.lines[i] ?? "";
    const toLine = toSource.lines[i] ?? "";
    let status = "same";
    if (!fromLine && toLine) status = "added";
    if (fromLine && !toLine) status = "removed";
    if (fromLine && toLine && fromLine !== toLine) status = "changed";

    const row = document.createElement("div");
    row.className = `diff-code-row diff-${status}`;
    row.innerHTML = `
      <div class="diff-code-cell">
        <span class="diff-line-number">${fromLine ? i + 1 : ""}</span>
        <pre>${fromLine || ""}</pre>
      </div>
      <div class="diff-code-cell">
        <span class="diff-line-number">${toLine ? i + 1 : ""}</span>
        <pre>${toLine || ""}</pre>
      </div>
    `;
    grid.appendChild(row);
  }

  diffElements.side.appendChild(container);
};

const updateVersionOptions = (model) => {
  diffElements.fromSelect.innerHTML = "";
  diffElements.toSelect.innerHTML = "";
  if (!model) return;
  model.versions.forEach((entry) => {
    const optionFrom = document.createElement("option");
    optionFrom.value = entry.version;
    optionFrom.textContent = entry.version;
    const optionTo = document.createElement("option");
    optionTo.value = entry.version;
    optionTo.textContent = entry.version;
    diffElements.fromSelect.appendChild(optionFrom);
    diffElements.toSelect.appendChild(optionTo);
  });
  if (model.versions.length > 1) {
    diffElements.fromSelect.value = model.versions[1].version;
    diffElements.toSelect.value = model.versions[0].version;
  }
};

const runDiff = async () => {
  const modelName = diffElements.modelSelect.value;
  const model = models.find((item) => item.name === modelName);
  if (!model) return;
  const fromVersion = diffElements.fromSelect.value;
  const toVersion = diffElements.toSelect.value;
  if (!fromVersion || !toVersion) return;
  diffElements.summary.innerHTML = "<div class=\"empty-state\"><p>Loading diff...</p></div>";
  diffElements.side.innerHTML = "<div class=\"empty-state\"><p>Loading diff...</p></div>";
  try {
    const [fromAttrs, toAttrs, fromSource, toSource] = await Promise.all([
      getAttributesForVersion(model, fromVersion),
      getAttributesForVersion(model, toVersion),
      getSourceForVersion(model, fromVersion),
      getSourceForVersion(model, toVersion),
    ]);
    const diffItems = buildDiff(fromAttrs, toAttrs);
    renderSummary(diffItems);
    renderSide(fromSource, toSource, fromVersion, toVersion);
    const url = new URL(window.location.href);
    url.searchParams.set("model", model.name);
    url.searchParams.set("from", fromVersion);
    url.searchParams.set("to", toVersion);
    window.history.replaceState({}, "", url);
  } catch (error) {
    diffElements.summary.innerHTML = "<div class=\"empty-state\"><p>Unable to load diff.</p></div>";
    diffElements.side.innerHTML = "<div class=\"empty-state\"><p>Unable to load diff.</p></div>";
  }
};

const applyTab = (mode) => {
  diffElements.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });
  diffElements.summary.classList.toggle("hidden", mode !== "summary");
  diffElements.side.classList.toggle("hidden", mode !== "side");
};

const hydrateFromUrl = () => {
  const url = new URL(window.location.href);
  const modelName = url.searchParams.get("model");
  const fromVersion = url.searchParams.get("from");
  const toVersion = url.searchParams.get("to");
  if (modelName) {
    diffElements.modelSelect.value = modelName;
  }
  if (fromVersion) {
    diffElements.fromSelect.value = fromVersion;
  }
  if (toVersion) {
    diffElements.toSelect.value = toVersion;
  }
};

const fetchModels = async () => {
  const response = await fetch("/api/models");
  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }
  const data = await response.json();
  return buildModels(data.tree || []);
};

const init = async () => {
  try {
    renderStatus("Syncing models from GitHub...");
    models = (await fetchModels()).sort((a, b) => a.name.localeCompare(b.name));
    diffElements.modelSelect.innerHTML = "";
    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.name;
      option.textContent = model.label;
      diffElements.modelSelect.appendChild(option);
    });
    hydrateFromUrl();
    const selected = models.find((item) => item.name === diffElements.modelSelect.value) || models[0];
    if (selected) {
      diffElements.modelSelect.value = selected.name;
      updateVersionOptions(selected);
      hydrateFromUrl();
    }
    renderStatus(`${models.length} models available`);
  } catch (error) {
    renderStatus("Failed to load models");
  }
};

diffElements.modelSelect.addEventListener("change", (event) => {
  const model = models.find((item) => item.name === event.target.value);
  updateVersionOptions(model);
});

diffElements.runButton.addEventListener("click", runDiff);

diffElements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => applyTab(tab.dataset.mode));
});

applyTab("summary");
init();
