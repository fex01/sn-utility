/**
 * Background Script: Enforce dictionary read-only on specific table fields
 *
 * Function:
 * - Sets sys_dictionary.read_only = true for the configured TABLES and FIELDS.
 *
 * Notes:
 * - If a field is inherited and the child table has no corresponding sys_dictionary row,
 *   the script logs NOT_FOUND for that table.field (no change applied).
 */

(function () {
  var TABLES = ["alm_asset", "alm_hardware"];
  var FIELDS = ["install_status", "substatus"];

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
      if (d.getValue("read_only") === "true") {
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

  for (var i = 0; i < TABLES.length; i++) {
    for (var j = 0; j < FIELDS.length; j++) {
      setDictReadOnly(TABLES[i], FIELDS[j]);
    }
  }
})();
