#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: compare_sys_plugins.sh FILE1 FILE2 FILE3 [OUTPUT_DIR]

Compares active plugins from three ServiceNow sys_plugins CSV exports and writes:
  - plugin_missing_report.csv
  - plugin_version_mismatch_report.csv

Instance names are inferred from filenames like sys_plugins_test.csv and
reported in the fixed order dev, test, prod.
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
from collections import Counter, defaultdict

missing_report, version_report, *input_files = sys.argv[1:]

EXPECTED_FILE_COUNT = 3
ENCODINGS = ("utf-8-sig", "cp1252", "latin-1")
REQUIRED_COLUMNS = {"name", "active", "version"}
PREFERRED_INSTANCE_ORDER = {"dev": 0, "test": 1, "prod": 2}

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
ordered_inputs = sorted(
    zip(instances, input_files),
    key=lambda item: (PREFERRED_INSTANCE_ORDER.get(item[0].casefold(), 999), item[0].casefold()),
)
instances = [instance for instance, _ in ordered_inputs]
input_files = [path for _, path in ordered_inputs]

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
            source = (row.get("source") or "").strip()
            version = (row.get("version") or "").strip()

            if not plugin_name:
                continue

            plugin_key = source or plugin_name
            plugin_entry = plugins.setdefault(
                plugin_key,
                {"names": set(), "sources": set(), "instances": {}},
            )
            plugin_entry["names"].add(plugin_name)
            if source:
                plugin_entry["sources"].add(source)

            instance_versions = plugin_entry["instances"]
            versions = instance_versions.setdefault(instance, set())
            if version:
                versions.add(version)


def sort_key(value: str):
    return value.casefold()


def cluster_name(source: str, name: str) -> str:
    if source.startswith("com.glide.cs.") or source in {
        "com.glide.dynamic_translation",
        "com.glide.dynamic_translation.spoke",
        "com.glide.language_detection_spoke",
        "com.glide.microsoft_translation_spoke",
        "com.glide.nlu.intent.discovery",
        "com.now_chat_language_change",
    }:
        return "Virtual Agent / Translation"
    if source.startswith("com.snc.discovery.") or source in {
        "com.glide.cmdb_reconcilliation",
        "com.snc.itom.discovery.license",
        "com.snc.onpremisse",
        "com.snc.service-mapping",
        "com.itom-noc-app",
        "com.glideapp.itom.snac",
        "com.glideapp.itom.snac.perf.acc",
        "com.glideapp.report.em",
        "com.snc.guided_setup_metadata.discovery",
    }:
        return "Discovery / ITOM / Event Mgmt"
    if (
        source.startswith("com.glide.hub.")
        or source.endswith(".ah")
        or source in {"com.sn.slack.ah", "com.glide.ih.spoke_builder"}
    ):
        return "IntegrationHub / Flow / Spokes"
    if source.startswith("com.snc.grc") or source.startswith("com.snc.risk"):
        return "GRC"
    if source.startswith("com.snc.sa.") or source.startswith("com.snc.pa.") or source == "com.snc.clotho":
        return "Analytics / PA / OI / MetricBase"
    if (
        source.startswith("com.snc.security_support")
        or source.startswith("com.snc.vul")
        or source == "com.glide.identity.agent.security"
    ):
        return "Security / Vulnerability / Identity"
    if source.startswith("com.glide.ais"):
        return "AI Search"
    if source.startswith("com.glide.erp"):
        return "ERP"
    if source.startswith("com.glide.http_client_config") or source.startswith("com.glide.mif"):
        return "Platform / Integration Infrastructure"
    if source in {"com.snc.agent.distributed.cluster", "com.snc.runbook_automation.runtime"}:
        return "MID / Orchestration Infrastructure"
    if source.startswith("com.glide.code_signing"):
        return "Platform Security"
    if source.startswith("com.snc.sam"):
        return "SAM"
    if source.startswith("com.snc.platform_document_management"):
        return "Document Management"
    if source.startswith("com.snc.csm_unified_theme") or source.startswith("com.sn_communities"):
        return "Demo / Experience Content"
    if source.startswith("com.em-alert-mgmt-content"):
        return "Alert Mgmt Content"
    if source.startswith("com.snc.smart_asmt_dep") or source.startswith("com.sn_anonymous_report_center"):
        return "Assessment / Reporting Utilities"
    if source.startswith("com.glide.highcharts"):
        return "Reporting UI"
    if source.startswith("com.snc.signaturepad"):
        return "Signature Pad"
    if source.startswith("com.snc.data_registry_dep"):
        return "Data Registry"
    return "Other"


def summarize_clusters(missing_rows, instances):
    cluster_combo_counts = defaultdict(Counter)
    cluster_missing_counts = defaultdict(Counter)
    cluster_totals = Counter()

    for row in missing_rows:
        combo = tuple(part.strip() for part in row["missing_in"].split(",") if part.strip())
        cluster = cluster_name(row["source"], row["name"])
        cluster_combo_counts[cluster][combo] += 1
        cluster_totals[cluster] += 1
        for instance in combo:
            cluster_missing_counts[cluster][instance] += 1

    only_missing = {}
    mostly_missing = {}

    for instance in instances:
        exact = []
        mostly = []
        for cluster, total in cluster_totals.items():
            exact_count = cluster_combo_counts[cluster][(instance,)]
            if exact_count == total:
                exact.append((cluster, exact_count, total))

            missing_count = cluster_missing_counts[cluster][instance]
            if (
                total >= 2
                and (missing_count / total) >= 0.6
                and exact_count != total
            ):
                mostly.append((cluster, missing_count, total))

        only_missing[instance] = sorted(
            exact,
            key=lambda item: (-item[1], -item[2], item[0].casefold()),
        )
        mostly_missing[instance] = sorted(
            mostly,
            key=lambda item: (-item[1], -item[2], item[0].casefold()),
        )

    return only_missing, mostly_missing


missing_rows = []
version_rows = []
version_columns = [f"{instance}_version" for instance in instances]

for plugin_key in sorted(plugins, key=sort_key):
    plugin_entry = plugins[plugin_key]
    instance_versions = plugin_entry["instances"]
    present_in = [instance for instance in instances if instance in instance_versions]
    missing_in = [instance for instance in instances if instance not in instance_versions]
    present_version_sets = [
        tuple(sorted(instance_versions[instance]))
        for instance in instances
        if instance in instance_versions and instance_versions[instance]
    ]
    plugin_name = " | ".join(sorted(plugin_entry["names"], key=sort_key))
    source = " | ".join(sorted(plugin_entry["sources"], key=sort_key))

    def format_versions(instance: str) -> str:
        values = sorted(instance_versions.get(instance, set()))
        return " | ".join(values)

    if missing_in:
        row = {
            "name": plugin_name,
            "source": source,
            "present_in": ", ".join(present_in),
            "missing_in": ", ".join(missing_in),
        }
        for instance in instances:
            row[f"{instance}_version"] = format_versions(instance)
        missing_rows.append(row)

    if len(set(present_version_sets)) > 1:
        row = {"name": plugin_name, "source": source}
        for instance in instances:
            row[f"{instance}_version"] = format_versions(instance)
        version_rows.append(row)


with open(missing_report, "w", newline="", encoding="utf-8") as handle:
    fieldnames = ["name", "source", "present_in", "missing_in", *version_columns]
    writer = csv.DictWriter(handle, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()
    writer.writerows(missing_rows)

with open(version_report, "w", newline="", encoding="utf-8") as handle:
    fieldnames = ["name", "source", *version_columns]
    writer = csv.DictWriter(handle, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()
    writer.writerows(version_rows)

missing_counts = Counter()
combo_counts = Counter()

for row in missing_rows:
    combo = tuple(part.strip() for part in row["missing_in"].split(",") if part.strip())
    combo_counts[combo] += 1
    for instance in combo:
        missing_counts[instance] += 1

only_missing_clusters, mostly_missing_clusters = summarize_clusters(missing_rows, instances)

print(f"Wrote {len(missing_rows)} rows to {missing_report}")
print(f"Wrote {len(version_rows)} rows to {version_report}")
print("")
print("Summary:")
print(f"- Plugins missing in at least one instance: {len(missing_rows)}")
print(
    "- Missing by instance: "
    + ", ".join(f"{instance}={missing_counts[instance]}" for instance in instances)
)
print(
    "- Missing patterns: "
    + ", ".join(
        f"{'+'.join(combo)}={count}"
        for combo, count in sorted(
            combo_counts.items(),
            key=lambda item: (-item[1], len(item[0]), item[0]),
        )
    )
)
if version_rows:
    print(f"- Version mismatches across installed plugins: {len(version_rows)}")
else:
    print("- Version mismatches across installed plugins: none")

for instance in instances:
    print(
        f"- Clusters only missing on {instance}: "
        + (
            "; ".join(
                f"{cluster} ({count}/{total})"
                for cluster, count, total in only_missing_clusters[instance][:4]
            )
            if only_missing_clusters[instance]
            else "none"
        )
    )
    print(
        f"- Clusters mainly missing on {instance}: "
        + (
            "; ".join(
                f"{cluster} ({count}/{total})"
                for cluster, count, total in mostly_missing_clusters[instance][:4]
            )
            if mostly_missing_clusters[instance]
            else "none"
        )
    )
PY
