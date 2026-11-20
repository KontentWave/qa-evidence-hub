import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ELIGIBLE_DOMAIN_DIRS = [
  'auth',
  'clients',
  'projects',
  'sessions',
  'evidence',
  'findings',
  'observations',
  'retests',
  'reports',
];

const EXCLUDED_SUFFIXES = [
  '.spec.ts',
  '.dto.ts',
  '.module.ts',
  '.controller.ts',
  '.port.ts',
];

export const LINE_THRESHOLD_PCT = 80;
export const BRANCH_THRESHOLD_PCT = 80;

function isEligibleServiceFile(relFromSrc) {
  const normalized = relFromSrc.split(path.sep).join('/');
  if (!normalized.endsWith('.ts') || normalized.endsWith('.d.ts')) {
    return false;
  }
  const [topDir, ...rest] = normalized.split('/');
  if (!ELIGIBLE_DOMAIN_DIRS.includes(topDir) || rest.length === 0) {
    return false;
  }
  const baseName = rest[rest.length - 1];
  if (baseName === 'index.ts') {
    return false;
  }
  return !EXCLUDED_SUFFIXES.some((suffix) => baseName.endsWith(suffix));
}

async function walkFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return results;
    }
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results.sort();
}

function computePct(covered, total) {
  if (total === 0) {
    return 100;
  }
  return Number(((covered / total) * 100).toFixed(2));
}

export async function evaluateApiServiceCoverage({
  apiDir,
  summaryPath = path.join(apiDir, 'coverage', 'coverage-summary.json'),
  lineThreshold = LINE_THRESHOLD_PCT,
  branchThreshold = BRANCH_THRESHOLD_PCT,
}) {
  const srcDir = path.join(apiDir, 'src');
  const allSrcFiles = await walkFiles(srcDir);
  const eligibleAbsFiles = allSrcFiles.filter((abs) =>
    isEligibleServiceFile(path.relative(srcDir, abs)),
  );

  if (eligibleAbsFiles.length === 0) {
    return {
      ok: true,
      status: 'N/A',
      eligibleFiles: [],
      linePct: null,
      branchPct: null,
      lineThreshold,
      branchThreshold,
      errors: [],
      message: `Service coverage (API auth/domain): N/A (0 eligible files under apps/api/src/{${ELIGIBLE_DOMAIN_DIRS.join(',')}}; ${lineThreshold}% line and ${branchThreshold}% branch thresholds armed for P1-03+).`,
    };
  }

  let rawSummary;
  try {
    rawSummary = await fs.readFile(summaryPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      status: 'FAIL',
      eligibleFiles: eligibleAbsFiles.map((f) => path.relative(apiDir, f).split(path.sep).join('/')),
      linePct: 0,
      branchPct: 0,
      lineThreshold,
      branchThreshold,
      errors: [
        `Coverage summary file missing or unreadable at ${summaryPath} (${error.message})`,
      ],
      message: 'Service coverage gate failed: missing coverage-summary.json.',
    };
  }

  const parsedSummary = JSON.parse(rawSummary);
  const normalizedEntries = new Map();
  for (const [key, value] of Object.entries(parsedSummary)) {
    if (key === 'total') {
      continue;
    }
    normalizedEntries.set(path.resolve(apiDir, key), value);
  }

  const errors = [];
  const fileReports = [];
  let linesCovered = 0;
  let linesTotal = 0;
  let branchesCovered = 0;
  let branchesTotal = 0;

  for (const absFile of eligibleAbsFiles) {
    const relFile = path.relative(apiDir, absFile).split(path.sep).join('/');
    const metrics = normalizedEntries.get(path.resolve(absFile));
    if (!metrics) {
      errors.push(
        `${relFile}: missing from coverage-summary.json (unexecuted eligible auth/domain service file)`,
      );
      fileReports.push({ file: relFile, linePct: 0, branchPct: 0 });
      continue;
    }

    const fileLinesCovered = Number(metrics.lines?.covered ?? 0);
    const fileLinesTotal = Number(metrics.lines?.total ?? 0);
    const fileBranchesCovered = Number(metrics.branches?.covered ?? 0);
    const fileBranchesTotal = Number(metrics.branches?.total ?? 0);

    linesCovered += fileLinesCovered;
    linesTotal += fileLinesTotal;
    branchesCovered += fileBranchesCovered;
    branchesTotal += fileBranchesTotal;

    const fileLinePct = computePct(fileLinesCovered, fileLinesTotal);
    const fileBranchPct = computePct(fileBranchesCovered, fileBranchesTotal);
    fileReports.push({ file: relFile, linePct: fileLinePct, branchPct: fileBranchPct });

    if (fileLinePct < lineThreshold) {
      errors.push(
        `${relFile}: line coverage ${fileLinePct}% is below required ${lineThreshold}% (${fileLinesCovered}/${fileLinesTotal})`,
      );
    }
    if (fileBranchPct < branchThreshold) {
      errors.push(
        `${relFile}: branch coverage ${fileBranchPct}% is below required ${branchThreshold}% (${fileBranchesCovered}/${fileBranchesTotal})`,
      );
    }
  }

  const aggregateLinePct = computePct(linesCovered, linesTotal);
  const aggregateBranchPct = computePct(branchesCovered, branchesTotal);

  if (aggregateLinePct < lineThreshold) {
    errors.push(
      `Aggregate auth/domain service line coverage ${aggregateLinePct}% is below required ${lineThreshold}% (${linesCovered}/${linesTotal})`,
    );
  }
  if (aggregateBranchPct < branchThreshold) {
    errors.push(
      `Aggregate auth/domain service branch coverage ${aggregateBranchPct}% is below required ${branchThreshold}% (${branchesCovered}/${branchesTotal})`,
    );
  }

  const ok = errors.length === 0;
  return {
    ok,
    status: ok ? 'PASS' : 'FAIL',
    eligibleFiles: fileReports,
    linePct: aggregateLinePct,
    branchPct: aggregateBranchPct,
    lineThreshold,
    branchThreshold,
    errors,
    message: ok
      ? `Service coverage (API auth/domain): PASS — lines ${aggregateLinePct}% (>= ${lineThreshold}%), branches ${aggregateBranchPct}% (>= ${branchThreshold}%) across ${fileReports.length} file(s).`
      : `Service coverage (API auth/domain): FAIL — lines ${aggregateLinePct}% (req ${lineThreshold}%), branches ${aggregateBranchPct}% (req ${branchThreshold}%).`,
  };
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const apiDir = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.join(repoRoot, 'apps', 'api');

  const result = await evaluateApiServiceCoverage({ apiDir });
  const outPath = path.join(apiDir, 'coverage', 'service-coverage-gate.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(`${outPath}`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    for (const err of result.errors) {
      process.stderr.write(` - ${err}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`${result.message}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
