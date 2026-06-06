const optionRenderers = new Map();

function registerOptionsRenderers(renderers) {
  for (const [name, renderer] of Object.entries(renderers)) {
    if (typeof renderer === "function") {
      optionRenderers.set(name, renderer);
    }
  }
}

function renderOptionSection(name) {
  const renderer = optionRenderers.get(name);
  if (renderer) {
    renderer();
  }
}

function renderOptionSections(names) {
  for (const name of names) {
    renderOptionSection(name);
  }
}

export { registerOptionsRenderers, renderOptionSection, renderOptionSections };
