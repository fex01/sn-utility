/**
 * Background Script: Report legacy status fields used on forms (classic UI metadata)
 *
 * Purpose:
 * - Scans sys_ui_element to find where selected status fields are placed on forms.
 * - Outputs a CSV report with columns: Table, View, Field.
 *
 * Output semantics:
 * - Table = sys_ui_section.name (the table whose form is being configured)
 * - View  = resolved display title of sys_ui_section.view (sys_ui_view.title), or "Default" if blank
 * - Field = sys_ui_element.element
 *
 * How to use:
 * - Run in Scripts - Background.
 * - Copy the printed CSV output from system logs.
 * - Adjust the FIELDS array to include/exclude fields.
 */

(function () {
  var FIELDS = [
    "hardware_ci_status",
    "hardware_ci_substatus",
    "hardware_status",
    "hardware_substatus",
    "installation_status",
    "install_status",
    "operational_status",
    "substatus",
  ];

  var rows = [];
  var viewCache = {}; // sys_ui_view.sys_id -> sys_ui_view.title

  function getViewDisplay(viewValue) {
    var v = (viewValue || "").toString().trim();
    if (!v) return "Default";

    // If it doesn't look like a sys_id, assume it's already display-like
    if (v.length !== 32) return v;

    if (viewCache[v]) return viewCache[v];

    var vw = new GlideRecord("sys_ui_view");
    if (vw.get(v)) {
      viewCache[v] = (
        vw.getValue("title") ||
        vw.getDisplayValue() ||
        v
      ).toString();
    } else {
      viewCache[v] = v; // fallback: keep sys_id
    }
    return viewCache[v];
  }

  var el = new GlideRecord("sys_ui_element");
  el.addQuery("element", "IN", FIELDS.join(","));
  el.addNotNullQuery("sys_ui_section");
  el.addQuery("sys_ui_section", "!=", "");
  el.query();

  while (el.next()) {
    var section = el.sys_ui_section.getRefRecord();
    if (!section || !section.isValidRecord()) continue;

    var tableName = (section.getValue("name") || "").toString().trim();
    if (!tableName) continue;

    rows.push({
      table: tableName,
      view: getViewDisplay(section.getValue("view")),
      field: (el.getValue("element") || "").toString(),
    });
  }

  rows.sort(function (a, b) {
    var t = a.table.localeCompare(b.table);
    if (t !== 0) return t;
    var v = a.view.localeCompare(b.view);
    if (v !== 0) return v;
    return a.field.localeCompare(b.field);
  });

  function esc(s) {
    s = (s || "").toString();
    if (s.indexOf('"') >= 0) s = s.replace(/"/g, '""');
    if (
      s.indexOf(",") >= 0 ||
      s.indexOf('"') >= 0 ||
      s.indexOf("\n") >= 0 ||
      s.indexOf("\r") >= 0
    ) {
      s = '"' + s + '"';
    }
    return s;
  }

  var csv = [];
  csv.push("Table,View,Field");
  for (var i = 0; i < rows.length; i++) {
    csv.push(
      [esc(rows[i].table), esc(rows[i].view), esc(rows[i].field)].join(",")
    );
  }

  gs.print(csv.join("\n"));
  gs.print("---");
  gs.print("Rows: " + rows.length);
})();
