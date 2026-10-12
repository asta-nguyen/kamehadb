import fs from "node:fs";
import path from "node:path";

const REQUIREMENT_ID = /^([A-Z][A-Z0-9]*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const REQUIREMENT_HEADING = /^([A-Z][A-Z0-9]*)-(.+)$/;

function slash(file) {
  return file.split(path.sep).join("/");
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function stripFencedCode(content) {
  let fence = null;
  let fenceLength = 0;
  return content.split("\n").map((line) => {
    const start = line.match(/^\s*(`{3,}|~{3,})/);
    if (!fence) {
      if (start) {
        fence = start[1][0];
        fenceLength = start[1].length;
        return "";
      }
      return line;
    }
    if (new RegExp(`^\\s*${fence}{${fenceLength},}\\s*$`).test(line)) {
      fence = null;
      fenceLength = 0;
    }
    return "";
  }).join("\n");
}

function lineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function maskInlineCode(line) {
  return line.replace(/(`+).*?\1/g, (match) => " ".repeat(match.length));
}

function codePathList(value) {
  const paths = [];
  let remaining = value.trim();
  while (remaining) {
    const match = remaining.match(/^`([^`]+)`(?:\s*,\s*|\s*$)/);
    if (!match) return { paths, valid: false };
    paths.push(match[1]);
    remaining = remaining.slice(match[0].length).trimStart();
  }
  return { paths, valid: paths.length > 0 };
}

function markdownFiles(root, wikiRoot, report) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (target === path.join(wikiRoot, "LOG.md")) continue;
      if (entry.isSymbolicLink()) {
        report(slash(path.relative(root, target)), 1, "symbolic links under docs/llm/ are not validated");
        continue;
      }
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(target);
      }
    }
  };
  visit(wikiRoot);
  return files.sort((a, b) => slash(path.relative(root, a)).localeCompare(slash(path.relative(root, b))));
}

function headingLines(content) {
  return content.split("\n").map((text, index) => {
    const match = text.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    return match ? { level: match[1].length, text: match[2], index } : null;
  }).filter(Boolean);
}

function headingSlug(text) {
  return text
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\-\s]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function headingAnchors(content) {
  const anchors = new Set();
  const counts = new Map();
  for (const heading of headingLines(stripFencedCode(content))) {
    const base = headingSlug(heading.text);
    if (!base) continue;
    const count = counts.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    counts.set(base, count + 1);
  }
  return anchors;
}

function splitTableRow(line) {
  if (!line.includes("|")) return null;
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function sectionRange(lines, heading, report, file) {
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].match(/^##\s+(.+?)\s*#*\s*$/)?.[1] === heading) matches.push(index);
  }
  if (matches.length > 1) report(file, matches[1] + 1, `duplicate ## ${heading} section`);
  if (matches.length === 0) return null;
  const start = matches[0];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end, lines: lines.slice(start + 1, end) };
}

function validateRepository(repositoryRoot) {
  const errors = [];
  const warnings = [];
  const report = (file, line, message, level = "ERROR") => {
    (level === "WARNING" ? warnings : errors).push({ file, line, message, level });
  };

  let root;
  try {
    root = fs.realpathSync(repositoryRoot);
  } catch {
    report(".", 1, `repository root does not exist: ${repositoryRoot}`);
    return { errors, warnings, fileCount: 0, requirementCount: 0 };
  }

  const wikiRoot = path.join(root, "docs", "llm");
  if (!fs.existsSync(wikiRoot) || !fs.statSync(wikiRoot).isDirectory()) {
    report("docs/llm/INDEX.md", 1, "wiki directory does not exist");
    return { errors, warnings, fileCount: 0, requirementCount: 0 };
  }
  if (!isInside(root, fs.realpathSync(wikiRoot))) {
    report("docs/llm/INDEX.md", 1, "wiki directory resolves outside the repository root");
    return { errors, warnings, fileCount: 0, requirementCount: 0 };
  }

  const files = markdownFiles(root, wikiRoot, report);
  const indexPath = path.join(wikiRoot, "INDEX.md");
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile() || !files.includes(indexPath)) {
    report("docs/llm/INDEX.md", 1, "required wiki index does not exist");
  }

  const pages = new Map();
  for (const file of files) {
    try {
      pages.set(file, fs.readFileSync(file, "utf8"));
    } catch (error) {
      report(slash(path.relative(root, file)), 1, `could not read Markdown file: ${error.message}`);
    }
  }

  const repositoryFile = (rawPath, sourceFile, sourceLine, label) => {
    if (!rawPath || path.isAbsolute(rawPath) || rawPath.includes("\\")) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `${label} must be a repository-relative path using / separators`);
      return null;
    }
    const target = path.resolve(root, rawPath);
    if (!isInside(root, target)) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `${label} escapes the repository root: ${rawPath}`);
      return null;
    }
    if (!fs.existsSync(target)) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `${label} does not exist: ${rawPath}`);
      return null;
    }
    try {
      const realTarget = fs.realpathSync(target);
      if (!isInside(root, realTarget)) {
        report(slash(path.relative(root, sourceFile)), sourceLine, `${label} resolves outside the repository root: ${rawPath}`);
        return null;
      }
      if (!fs.statSync(realTarget).isFile()) {
        report(slash(path.relative(root, sourceFile)), sourceLine, `${label} is not a file: ${rawPath}`);
        return null;
      }
      return realTarget;
    } catch (error) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `${label} cannot be checked: ${error.message}`);
      return null;
    }
  };

  const prefixes = new Map();
  const domains = new Map();
  const retiredIds = new Set();
  const requirementIds = new Map();
  const slugsByPrefix = new Map();
  const indexContent = pages.get(indexPath) ?? "";
  const indexLines = stripFencedCode(indexContent).split("\n");
  const prefixSection = sectionRange(indexLines, "Requirement prefixes", report, "docs/llm/INDEX.md");

  if (prefixSection) {
    const tableStart = prefixSection.lines.findIndex((line) => line.includes("|"));
    if (tableStart < 0) {
      report("docs/llm/INDEX.md", prefixSection.start + 2, "prefix registry needs a Prefix/Domain table");
    } else {
      const header = splitTableRow(prefixSection.lines[tableStart]);
      const separator = splitTableRow(prefixSection.lines[tableStart + 1] ?? "");
      if (header?.length !== 2 || header[0] !== "Prefix" || header[1] !== "Domain"
        || separator?.length !== 2 || !separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        report("docs/llm/INDEX.md", prefixSection.start + tableStart + 2, "malformed prefix registry; expected a Prefix | Domain table");
      } else {
        for (let rowIndex = tableStart + 2; rowIndex < prefixSection.lines.length; rowIndex += 1) {
          const cells = splitTableRow(prefixSection.lines[rowIndex]);
          if (!cells) break;
          const prefix = cells[0] ?? "";
          const domain = cells[1] ?? "";
          const line = prefixSection.start + rowIndex + 2;
          if (cells.length !== 2 || !/^[A-Z][A-Z0-9]*$/.test(prefix) || !domain) {
            report("docs/llm/INDEX.md", line, "malformed prefix registry row");
            continue;
          }
          if (prefixes.has(prefix)) report("docs/llm/INDEX.md", line, `repeated prefix: ${prefix}`);
          if (domains.has(domain)) report("docs/llm/INDEX.md", line, `repeated domain: ${domain}`);
          prefixes.set(prefix, domain);
          domains.set(domain, prefix);
        }
      }
    }
  }

  const retiredSection = sectionRange(indexLines, "Retired requirement IDs", report, "docs/llm/INDEX.md");
  if (retiredSection) {
    for (let index = 0; index < retiredSection.lines.length; index += 1) {
      const line = retiredSection.lines[index];
      if (!line.trim()) continue;
      const match = line.match(/^\s*[-*]\s+`?([^`\s]+)`?\s*$/);
      const id = match?.[1];
      if (!id || !REQUIREMENT_ID.test(id)) {
        report("docs/llm/INDEX.md", retiredSection.start + index + 2, "malformed retired requirement ID");
      } else if (retiredIds.has(id)) {
        report("docs/llm/INDEX.md", retiredSection.start + index + 2, `duplicate retired requirement ID: ${id}`);
      } else {
        retiredIds.add(id);
      }
    }
  }

  let requirementCount = 0;
  for (const [file, original] of pages) {
    const content = stripFencedCode(original);
    const lines = content.split("\n");
    const relativeFile = slash(path.relative(root, file));
    const requirementsSection = sectionRange(lines, "Requirements", report, relativeFile);
    const allHeadings = headingLines(content);
    for (const heading of allHeadings) {
      if (heading.level === 3 && REQUIREMENT_HEADING.test(heading.text)) {
        const inRequirements = requirementsSection && heading.index > requirementsSection.start && heading.index < requirementsSection.end;
        if (!inRequirements) report(relativeFile, heading.index + 1, `requirement-shaped heading outside ## Requirements: ${heading.text}`);
      }
    }
    if (requirementsSection) {
      for (let index = requirementsSection.start + 1; index < requirementsSection.end; index += 1) {
        if (/^###[^#\s]/.test(lines[index])) report(relativeFile, index + 1, "malformed requirement heading; add a space after ###");
      }
    }

    const sourcesSection = sectionRange(lines, "Sources", report, relativeFile);
    const sourcePaths = new Set();
    if (sourcesSection) {
      for (let index = 0; index < sourcesSection.lines.length; index += 1) {
        const line = sourcesSection.lines[index];
        if (!/^\s*[-*]\s+/.test(line)) continue;
        const paths = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
        if (!paths.length) report(relativeFile, sourcesSection.start + index + 2, "Sources entries must use backtick-quoted file paths");
        for (const sourcePath of paths) {
          sourcePaths.add(sourcePath);
          repositoryFile(sourcePath, file, sourcesSection.start + index + 2, "Sources path");
        }
      }
    }

    if (!requirementsSection) continue;
    const reqHeadings = allHeadings.filter((heading) => heading.level === 3
      && heading.index > requirementsSection.start && heading.index < requirementsSection.end);
    const pagePrefixes = new Set();
    const idsInPage = [];
    for (let position = 0; position < reqHeadings.length; position += 1) {
      const heading = reqHeadings[position];
      const id = heading.text.trim();
      const idMatch = id.match(REQUIREMENT_ID);
      if (!idMatch) {
        report(relativeFile, heading.index + 1, `invalid requirement ID/heading: ${id}`);
        continue;
      }
      const [, prefix, slug] = idMatch;
      requirementCount += 1;
      idsInPage.push({ id, heading });
      pagePrefixes.add(prefix);
      if (!prefixes.has(prefix)) report(relativeFile, heading.index + 1, `unregistered requirement prefix: ${prefix}`);
      if (retiredIds.has(id)) report(relativeFile, heading.index + 1, `retired requirement ID is reused: ${id}`);
      if (requirementIds.has(id)) {
        report(relativeFile, heading.index + 1, `duplicate requirement ID ${id}; first defined in ${requirementIds.get(id)}`);
      } else {
        requirementIds.set(id, relativeFile);
        const siblings = slugsByPrefix.get(prefix) ?? [];
        for (const sibling of siblings) {
          if (slug.startsWith(sibling.slug) || sibling.slug.startsWith(slug)) {
            report(relativeFile, heading.index + 1, `near-duplicate requirement slug: ${id} and ${sibling.id}`, "WARNING");
          }
        }
        siblings.push({ id, slug });
        slugsByPrefix.set(prefix, siblings);
      }

      const end = reqHeadings[position + 1]?.index ?? requirementsSection.end;
      const block = lines.slice(heading.index + 1, end);
      const scenarios = [];
      for (let index = 0; index < block.length; index += 1) {
        if (/^####\s+Scenario:\s*\S/.test(block[index])) scenarios.push(index);
      }
      const scenarioLineIndexes = new Set();
      for (let index = 0; index < scenarios.length; index += 1) {
        const scenarioStart = scenarios[index];
        const nextHeading = block.findIndex((line, lineIndex) => lineIndex > scenarioStart && /^####\s+/.test(line));
        const scenarioEnd = scenarios[index + 1] ?? (nextHeading < 0 ? block.length : nextHeading);
        for (let lineIndex = scenarioStart; lineIndex < scenarioEnd; lineIndex += 1) scenarioLineIndexes.add(lineIndex);
      }
      const statementText = block.filter((line, index) => !scenarioLineIndexes.has(index)
        && !/^\s*Evidence:/.test(line)).join(" ").trim();
      const shallCount = [...statementText.matchAll(/\bSHALL\b/g)].length;
      if (shallCount !== 1 || !/\S.*\bSHALL\b.*\S/.test(statementText)) {
        report(relativeFile, heading.index + 1, `${id} must have exactly one SHALL statement`);
      }

      if (scenarios.length === 0) report(relativeFile, heading.index + 1, `${id} needs at least one #### Scenario:`);
      for (let index = 0; index < scenarios.length; index += 1) {
        const scenarioStart = scenarios[index];
        const nextHeading = block.findIndex((line, lineIndex) => lineIndex > scenarioStart && /^####\s+/.test(line));
        const scenarioEnd = scenarios[index + 1] ?? (nextHeading < 0 ? block.length : nextHeading);
        const scenarioLines = block.slice(scenarioStart + 1, scenarioEnd);
        for (const keyword of ["GIVEN", "WHEN", "THEN"]) {
          if (!scenarioLines.some((line) => new RegExp(`^\\s*-\\s+${keyword}\\b`).test(line))) {
            report(relativeFile, heading.index + scenarioStart + 2, `${id} scenario needs a ${keyword} line`);
          }
        }
      }

      const evidenceLines = block.map((line, index) => ({ line, index })).filter(({ line }) => /^\s*Evidence:/.test(line));
      if (evidenceLines.length !== 1) {
        report(relativeFile, heading.index + 1, `${id} must have exactly one Evidence: line`);
        continue;
      }
      const evidence = evidenceLines[0];
      const evidenceBody = evidence.line.replace(/^\s*Evidence:\s*/, "");
      const parsedEvidence = codePathList(evidenceBody);
      const evidencePaths = parsedEvidence.paths;
      if (!parsedEvidence.valid) {
        report(relativeFile, heading.index + evidence.index + 2, `${id} Evidence: must be a comma-separated list of backtick-quoted paths`);
      }
      if (!sourcesSection) report(relativeFile, heading.index + evidence.index + 2, `${id} needs a ## Sources section`);
      for (const evidencePath of evidencePaths) {
        repositoryFile(evidencePath, file, heading.index + evidence.index + 2, "Evidence path");
        if (!sourcePaths.has(evidencePath)) {
          report(relativeFile, heading.index + evidence.index + 2, `${id} Evidence path is not listed in ## Sources: ${evidencePath}`);
        }
      }
    }

    if (pagePrefixes.size > 1) report(relativeFile, requirementsSection.start + 1, "a Requirements page must use only one prefix");
    for (let index = 1; index < idsInPage.length; index += 1) {
      if (idsInPage[index - 1].id > idsInPage[index].id) {
        report(relativeFile, idsInPage[index].heading.index + 1, "requirements are not sorted by ID");
      }
    }
  }

  if (requirementCount > 0 && !prefixSection) {
    report("docs/llm/INDEX.md", 1, "requirements exist but ## Requirement prefixes is missing");
  }

  const fileContents = new Map(pages);
  const validateMarkdownLink = (rawDestination, sourceFile, sourceLine) => {
    const destination = rawDestination.trim().replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(destination)) return;
    const hashAt = destination.indexOf("#");
    const pathAndQuery = hashAt < 0 ? destination : destination.slice(0, hashAt);
    const fragmentRaw = hashAt < 0 ? "" : destination.slice(hashAt + 1);
    const queryAt = pathAndQuery.indexOf("?");
    const rawPath = queryAt < 0 ? pathAndQuery : pathAndQuery.slice(0, queryAt);
    let decodedPath;
    let fragment;
    try {
      decodedPath = decodeURIComponent(rawPath);
      fragment = decodeURIComponent(fragmentRaw);
    } catch {
      report(slash(path.relative(root, sourceFile)), sourceLine, `invalid URL encoding in Markdown link: ${destination}`);
      return;
    }
    const target = decodedPath ? path.resolve(path.dirname(sourceFile), decodedPath) : sourceFile;
    if (!isInside(root, target)) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `Markdown link escapes the repository root: ${destination}`);
      return;
    }
    const targetRelative = slash(path.relative(root, target));
    if (targetRelative.startsWith("docs/agent-devkit/")) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `docs/llm/ must not link to process artifacts: ${destination}`);
      return;
    }
    if (!fs.existsSync(target)) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `Markdown link target does not exist: ${destination}`);
      return;
    }
    let realTarget;
    try {
      realTarget = fs.realpathSync(target);
      if (!isInside(root, realTarget)) {
        report(slash(path.relative(root, sourceFile)), sourceLine, `Markdown link resolves outside the repository root: ${destination}`);
        return;
      }
      if (slash(path.relative(root, realTarget)).startsWith("docs/agent-devkit/")) {
        report(slash(path.relative(root, sourceFile)), sourceLine, `docs/llm/ must not link to process artifacts: ${destination}`);
        return;
      }
      if (!fs.statSync(realTarget).isFile()) {
        report(slash(path.relative(root, sourceFile)), sourceLine, `Markdown link target is not a file: ${destination}`);
        return;
      }
    } catch (error) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `Markdown link target cannot be checked: ${error.message}`);
      return;
    }
    if (!fragment || path.basename(realTarget) === "LOG.md" || path.extname(realTarget).toLowerCase() !== ".md") return;
    let targetContent = fileContents.get(realTarget);
    if (targetContent === undefined) {
      try {
        targetContent = fs.readFileSync(realTarget, "utf8");
        fileContents.set(realTarget, targetContent);
      } catch (error) {
        report(slash(path.relative(root, sourceFile)), sourceLine, `Markdown link anchor cannot be checked: ${error.message}`);
        return;
      }
    }
    const anchors = headingAnchors(targetContent);
    if (!anchors.has(fragment) && !anchors.has(headingSlug(fragment))) {
      report(slash(path.relative(root, sourceFile)), sourceLine, `Markdown link anchor not found: ${destination}`);
    }
  };

  for (const [file, original] of pages) {
    const relativeFile = slash(path.relative(root, file));
    const content = stripFencedCode(original);
    const lines = content.split("\n");
    const definitions = new Set();
    for (let index = 0; index < lines.length; index += 1) {
      const lineWithoutCode = maskInlineCode(lines[index]);
      if (/\[\[[^\]]+\]\]/.test(lineWithoutCode)) {
        report(relativeFile, index + 1, "legacy [[...]] links are not allowed; use relative Markdown links");
      }

      const definition = lineWithoutCode.match(/^\s*\[([^\]]+)\]:\s*(<[^>]+>|\S+)/);
      if (definition) {
        definitions.add(definition[1].trim().toLowerCase());
        validateMarkdownLink(definition[2], file, index + 1);
      } else if (/^\s*\[[^\]]+\]:/.test(lineWithoutCode)) {
        report(relativeFile, index + 1, "Markdown reference definition needs a destination");
      }
    }

    const codeFree = content.split("\n").map(maskInlineCode).join("\n");
    const inline = /!?\[[^\]]*\]\(\s*(<[^>]+>|(?:\\.|[^\s)])+)(?:\s+["'][^"']*["'])?\s*\)/g;
    for (const match of codeFree.matchAll(inline)) {
      validateMarkdownLink(match[1], file, lineNumber(content, match.index));
    }
    for (const match of codeFree.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
      const label = (match[2] || match[1]).trim().toLowerCase();
      if (!definitions.has(label)) report(relativeFile, lineNumber(content, match.index), `undefined Markdown reference link: ${label}`);
    }
  }

  return { errors, warnings, fileCount: files.length, requirementCount };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    process.stderr.write("Usage: node <document-wiki-skill>/scripts/validate-llm-wiki.mjs [repository-root]\n");
    process.exitCode = 2;
    return;
  }

  const repositoryRoot = path.resolve(args[0] ?? process.cwd());
  const result = validateRepository(repositoryRoot);
  for (const diagnostic of [...result.errors, ...result.warnings]) {
    const stream = diagnostic.level === "WARNING" ? process.stdout : process.stderr;
    stream.write(`${diagnostic.level} ${diagnostic.file}:${diagnostic.line}: ${diagnostic.message}\n`);
  }
  const warningLabel = result.warnings.length === 1 ? "warning" : "warnings";
  process.stdout.write(`Validated ${result.fileCount} Markdown files and ${result.requirementCount} requirements: ${result.errors.length} errors, ${result.warnings.length} ${warningLabel}.\n`);
  if (result.errors.length) process.exitCode = 1;
}

main();
