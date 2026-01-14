/**
 * Background Script: Enforce dictionary read-only on legacy status fields (Asset + CI tables)
 *
 * Function:
 * - Sets sys_dictionary.read_only = true for the configured field list on:
 *    - all tables STARTSWITH "alm_"
 *    - all tables STARTSWITH "cmdb_ci"
 *    - plus EXTRA_TABLES (e.g., service_offering)
 *
 * Notes:
 * - If a field is inherited and the child table has no corresponding sys_dictionary row,
 *   the script logs NOT_FOUND for that table.field (no change applied).
 * - Updates every matching sys_dictionary row (including overrides, if present).
 */

(function () {
  var CONFIG = {
    ALM_PREFIX: "alm_",
    CI_PREFIX: "cmdb_ci",
    EXTRA_TABLES: ["service_offering"],
    FIELDS: ["install_status", "substatus", "operational_status"],
  };

  function getTargetTables() {
    var tables = [];

    var dbo = new GlideRecord("sys_db_object");
    dbo.addQuery("name", "STARTSWITH", CONFIG.ALM_PREFIX);
    dbo.query();
    while (dbo.next()) tables.push((dbo.getValue("name") || "").toString());

    dbo = new GlideRecord("sys_db_object");
    dbo.addQuery("name", "STARTSWITH", CONFIG.CI_PREFIX);
    dbo.query();
    while (dbo.next()) tables.push((dbo.getValue("name") || "").toString());

    for (var i = 0; i < CONFIG.EXTRA_TABLES.length; i++) {
      if (tables.indexOf(CONFIG.EXTRA_TABLES[i]) < 0)
        tables.push(CONFIG.EXTRA_TABLES[i]);
    }

    // de-dupe + sort
    var seen = {};
    var out = [];
    for (var j = 0; j < tables.length; j++) {
      var t = tables[j];
      if (!t || seen[t]) continue;
      seen[t] = true;
      out.push(t);
    }
    out.sort();
    return out;
  }

  function setDictReadOnly(table, field) {
    var d = new GlideRecord("sys_dictionary");
    d.addQuery("name", table);
    d.addQuery("element", field);
    d.query();

    if (!d.next()) {
      gs.print(table + "." + field + " -> NOT_FOUND");
      return;
    }

    do {
      if ((d.getValue("read_only") || "").toString() === "true") {
        gs.print(
          table +
            "." +
            field +
            " -> ALREADY_TRUE (sys_id=" +
            d.getUniqueValue() +
            ")"
        );
        continue;
      }

      d.setValue("read_only", true);
      d.update();
      gs.print(
        table + "." + field + " -> SET_TRUE (sys_id=" + d.getUniqueValue() + ")"
      );
    } while (d.next());
  }

  var tables = getTargetTables();
  gs.print("Target tables: " + tables.length);

  for (var i = 0; i < tables.length; i++) {
    for (var j = 0; j < CONFIG.FIELDS.length; j++) {
      setDictReadOnly(tables[i], CONFIG.FIELDS[j]);
    }
  }
})();
