#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: compare_sys_plugins.sh FILE1 FILE2 FILE3 [OUTPUT_DIR]

Compares active plugins from three ServiceNow sys_plugins CSV exports and writes:
  - plugin_missing_report.csv
  - plugin_version_mismatch_report.csv

Instance names are inferred from filenames like sys_plugins_test.csv.
Reports are written to ./output unless OUTPUT_DIR is provided.
EOF
}

if [[ $# -lt 3 || $# -gt 4 ]]; then
  usage >&2
  exit 1
fi

input_files=("$1" "$2" "$3")
output_dir="${4:-$(pwd)/output}"

for input_file in "${input_files[@]}"; do
  if [[ ! -f "$input_file" ]]; then
    echo "Input file not found: $input_file" >&2
    exit 1
  fi
done

mkdir -p "$output_dir"

missing_report="${output_dir%/}/plugin_missing_report.csv"
version_report="${output_dir%/}/plugin_version_mismatch_report.csv"

python3 - "$missing_report" "$version_report" "${input_files[@]}" <<'PY'
import csv
import io
import os
import re
import sys

missing_report, version_report, *input_files = sys.argv[1:]

EXPECTED_FILE_COUNT = 3
ENCODINGS = ("utf-8-sig", "cp1252", "latin-1")
REQUIRED_COLUMNS = {"name", "active", "version"}

if len(input_files) != EXPECTED_FILE_COUNT:
    raise SystemExit(f"Expected {EXPECTED_FILE_COUNT} input files, got {len(input_files)}")


def infer_instance_name(path: str) -> str:
    basename = os.path.basename(path)
    match = re.match(r"sys_plugins_(.+?)\.csv$", basename, re.IGNORECASE)
    if match:
        return match.group(1)
    return os.path.splitext(basename)[0]


def open_csv(path: str):
    last_error = None
    for encoding in ENCODINGS:
        try:
            with open(path, "r", encoding=encoding, newline="") as handle:
                content = handle.read()
            return io.StringIO(content)
        except UnicodeDecodeError as exc:
            last_error = exc
    raise SystemExit(f"Unable to decode CSV file {path}: {last_error}")


instances = [infer_instance_name(path) for path in input_files]

if len(set(instances)) != len(instances):
    raise SystemExit(
        "Instance names inferred from input files must be unique: "
        + ", ".join(instances)
    )

plugins = {}

for path, instance in zip(input_files, instances):
    with open_csv(path) as handle:
        reader = csv.DictReader(handle)
        fieldnames = set(reader.fieldnames or [])
        missing_columns = REQUIRED_COLUMNS - fieldnames
        if missing_columns:
            raise SystemExit(
                f"{path} is missing required columns: {', '.join(sorted(missing_columns))}"
            )

        for line_number, row in enumerate(reader, start=2):
            active = (row.get("active") or "").strip().lower()
            if active != "true":
                continue

            plugin_name = (row.get("name") or "").strip()
            version = (row.get("version") or "").strip()

            if not plugin_name:
                continue

            instance_versions = plugins.setdefault(plugin_name, {})
            versions = instance_versions.setdefault(instance, set())
            if version:
                versions.add(version)


def sort_key(value: str):
    return value.casefold()


missing_rows = []
version_rows = []
version_columns = [f"{instance}_version" for instance in instances]

for plugin_name in sorted(plugins, key=sort_key):
    instance_versions = plugins[plugin_name]
    present_in = [instance for instance in instances if instance in instance_versions]
    missing_in = [instance for instance in instances if instance not in instance_versions]
    present_version_sets = [
        tuple(sorted(instance_versions[instance]))
        for instance in instances
        if instance in instance_versions and instance_versions[instance]
    ]

    def format_versions(instance: str) -> str:
        values = sorted(instance_versions.get(instance, set()))
        return " | ".join(values)

    if missing_in:
        row = {
            "name": plugin_name,
            "present_in": ", ".join(present_in),
            "missing_in": ", ".join(missing_in),
        }
        for instance in instances:
            row[f"{instance}_version"] = format_versions(instance)
        missing_rows.append(row)

    if len(set(present_version_sets)) > 1:
        row = {"name": plugin_name}
        for instance in instances:
            row[f"{instance}_version"] = format_versions(instance)
        version_rows.append(row)


with open(missing_report, "w", newline="", encoding="utf-8") as handle:
    fieldnames = ["name", "present_in", "missing_in", *version_columns]
    writer = csv.DictWriter(handle, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()
    writer.writerows(missing_rows)

with open(version_report, "w", newline="", encoding="utf-8") as handle:
    fieldnames = ["name", *version_columns]
    writer = csv.DictWriter(handle, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()
    writer.writerows(version_rows)

print(f"Wrote {len(missing_rows)} rows to {missing_report}")
print(f"Wrote {len(version_rows)} rows to {version_report}")
PY
