import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function evaluateCucumberJsonReport(features, label = 'Foundation BDD') {
  const errors = [];

  if (!Array.isArray(features)) {
    return {
      ok: false,
      executedScenarios: 0,
      errors: [`${label}: expected Cucumber JSON report to be an array of features`],
    };
  }

  let executedScenarios = 0;

  for (const feature of features) {
    const elements = Array.isArray(feature?.elements) ? feature.elements : [];
    for (const element of elements) {
      if (element?.type && element.type !== 'scenario') {
        continue;
      }
      executedScenarios += 1;
      const scenarioName = `${feature?.name ?? 'Unknown feature'} :: ${element?.name ?? 'Unnamed scenario'}`;
      const steps = Array.isArray(element?.steps) ? element.steps : [];
      if (steps.length === 0) {
        errors.push(`${label}: scenario "${scenarioName}" has zero steps`);
        continue;
      }
      for (const step of steps) {
        const status = step?.result?.status;
        if (status !== 'passed') {
          errors.push(
            `${label}: step "${(step?.keyword ?? '').trim()} ${step?.name ?? '<hook>'}" in "${scenarioName}" finished with status "${status ?? 'unknown'}"`,
          );
        }
      }
    }
  }

  if (executedScenarios === 0) {
    errors.push(
      `${label}: zero scenarios executed; CI requires at least one executed Foundation scenario`,
    );
  }

  return {
    ok: errors.length === 0,
    executedScenarios,
    errors,
  };
}

async function main() {
  const reportArg = process.argv[2] ?? 'apps/api/coverage/cucumber-foundation.json';
  const reportPath = path.resolve(process.cwd(), reportArg);

  let raw;
  try {
    raw = await fs.readFile(reportPath, 'utf8');
  } catch (error) {
    process.stderr.write(
      `Foundation BDD verification failed: unable to read ${reportArg} (${error.message})\n`,
    );
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(
      `Foundation BDD verification failed: invalid JSON in ${reportArg} (${error.message})\n`,
    );
    process.exit(1);
  }

  const result = evaluateCucumberJsonReport(parsed, 'Foundation BDD');
  if (!result.ok) {
    for (const err of result.errors) {
      process.stderr.write(`${err}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `Foundation BDD verified: ${result.executedScenarios} scenario(s) executed and passed.\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
