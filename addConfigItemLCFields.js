/**
 * Background Script (Prototype): Bulk adapt classic form layouts to display Lifecycle fields on CI forms
 *
 * Purpose:
 * - Inserts life_cycle_stage + life_cycle_stage_status into CI form views that use legacy status fields.
 * - Prints a CSV report (always), and optionally applies changes (CONFIG.APPLY=true).
 *
 * Scope:
 * - All tables with name STARTSWITH "cmdb_ci" plus "service_offering".
 *
 * Behavior (per table + view):
 * - Processes views where either install_status OR operational_status exists anywhere on that view.
 * - Skips (table, view) if life_cycle_stage exists anywhere on that view.
 * - Finds a single anchor (earliest legacy status element by position; tie-breaker sys_id) and:
 *    1) Shifts all elements in the anchor section with position >= anchorPos by +2
 *    2) Inserts life_cycle_stage at anchorPos
 *    3) Inserts life_cycle_stage_status at anchorPos + 1
 *
 * How to use:
 * - Set CONFIG.APPLY=false for dry-run (CSV report only).
 * - Set CONFIG.APPLY=true to apply updates/inserts (CSV report still printed).
 * - Run in Scripts - Background.
 *
 * Output:
 * - CSV columns: Table,View,Action,SectionSysId,Element,OldPos,NewPos,Note
 */

(function () {
  /************** CONFIG **************/
  var CONFIG = {
    APPLY: false, // false = report only, true = apply updates/inserts (still prints report)
    TABLE_PREFIX: "cmdb_ci",
    EXTRA_TABLES: ["service_offering"],

    LEGACY_FIELDS: ["install_status", "operational_status"],
    LC_STAGE: "life_cycle_stage",
    LC_STATUS: "life_cycle_stage_status",
  };

  /************** REPORT (CSV) **************/
  var rows = [];
  function addRow(o) {
    rows.push({
      table: o.table || "",
      view: o.view || "",
      action: o.action || "",
      section: o.section || "",
      element: o.element || "",
      oldPos: o.oldPos === null || o.oldPos === undefined ? "" : "" + o.oldPos,
      newPos: o.newPos === null || o.newPos === undefined ? "" : "" + o.newPos,
      note: o.note || "",
    });
  }

  function esc(s) {
    s = s === null || s === undefined ? "" : s + "";
    if (s.indexOf('"') >= 0) s = s.replace(/"/g, '""');
    if (
      s.indexOf(",") >= 0 ||
      s.indexOf('"') >= 0 ||
      s.indexOf("\n") >= 0 ||
      s.indexOf("\r") >= 0
    )
      s = '"' + s + '"';
    return s;
  }

  function printCsv() {
    rows.sort(function (a, b) {
      var t = a.table.localeCompare(b.table);
      if (t !== 0) return t;
      var v = a.view.localeCompare(b.view);
      if (v !== 0) return v;
      return a.action.localeCompare(b.action);
    });

    var out = [];
    out.push("Table,View,Action,SectionSysId,Element,OldPos,NewPos,Note");
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push(
        [
          esc(r.table),
          esc(r.view),
          esc(r.action),
          esc(r.section),
          esc(r.element),
          esc(r.oldPos),
          esc(r.newPos),
          esc(r.note),
        ].join(",")
      );
    }

    gs.print(out.join("\n"));
    gs.print("---");
    gs.print("Rows: " + rows.length);
    gs.print("Mode: " + (CONFIG.APPLY ? "APPLY" : "DRY-RUN"));
  }

  /************** HELPERS **************/
  function safeInt(x) {
    var n = parseInt(x, 10);
    return isNaN(n) ? 0 : n;
  }

  function stableLess(a, b) {
    // Sort by position asc, then by sys_id asc for deterministic tie-breaker
    if (a.pos !== b.pos) return a.pos < b.pos;
    return (a.sys_id || "") < (b.sys_id || "");
  }

  function elementExistsInSection(sectionSysId, elementName) {
    var ex = new GlideRecord("sys_ui_element");
    ex.addQuery("sys_ui_section", sectionSysId);
    ex.addQuery("element", elementName);
    ex.setLimit(1);
    ex.query();
    return ex.next();
  }

  function insertElement(
    table,
    viewLabel,
    viewId,
    sectionSysId,
    elementName,
    position
  ) {
    if (elementExistsInSection(sectionSysId, elementName)) {
      addRow({
        table: table,
        view: viewLabel, // <-- display name
        action: "INSERT_SKIP_EXISTS",
        section: sectionSysId,
        element: elementName,
        oldPos: "",
        newPos: position,
        note: "element already in section",
      });
      return;
    }

    if (!CONFIG.APPLY) {
      addRow({
        table: table,
        view: viewLabel, // <-- display name
        action: "INSERT_DRYRUN",
        section: sectionSysId,
        element: elementName,
        oldPos: "",
        newPos: position,
        note: "",
      });
      return;
    }

    var ins = new GlideRecord("sys_ui_element");
    ins.initialize();
    ins.setValue("sys_ui_section", sectionSysId);
    ins.setValue("element", elementName);
    ins.setValue("position", position);
    var newId = ins.insert();

    addRow({
      table: table,
      view: viewLabel, // <-- display name
      action: "INSERT_APPLIED",
      section: sectionSysId,
      element: elementName,
      oldPos: "",
      newPos: position,
      note: "sys_id=" + newId,
    });
  }

  function isSysId(s) {
    return s && (s + "").length === 32 && /^[0-9a-f]{32}$/i.test(s + "");
  }

  var viewCache = {}; // sys_id -> title

  function getViewDisplay(viewValue) {
    var v = (viewValue || "").toString().trim();
    if (!v) return "Default";
    if (v.length !== 32 || !isSysId(v)) return v;

    if (viewCache[v]) return viewCache[v];

    var vw = new GlideRecord("sys_ui_view");
    viewCache[v] = vw.get(v)
      ? (vw.getValue("title") || vw.getDisplayValue() || v).toString()
      : v;
    return viewCache[v];
  }

  /************** STEP 1: Build table list **************/
  function getTargetTables() {
    var tables = [];

    var dbo = new GlideRecord("sys_db_object");
    dbo.addQuery("name", "STARTSWITH", CONFIG.TABLE_PREFIX);
    dbo.query();
    while (dbo.next()) {
      tables.push((dbo.getValue("name") || "").toString());
    }

    for (var i = 0; i < CONFIG.EXTRA_TABLES.length; i++) {
      if (tables.indexOf(CONFIG.EXTRA_TABLES[i]) < 0)
        tables.push(CONFIG.EXTRA_TABLES[i]);
    }

    tables.sort();
    return tables;
  }

  /************** STEP 2: Discover views per table where legacy fields exist **************/
  function discoverViewsByTable(tables) {
    // viewsByTable[table][viewId] = true
    var viewsByTable = {};
    for (var i = 0; i < tables.length; i++) viewsByTable[tables[i]] = {};

    var el = new GlideRecord("sys_ui_element");
    el.addQuery("element", "IN", CONFIG.LEGACY_FIELDS.join(","));
    el.addQuery("sys_ui_section.name", "IN", tables.join(","));
    el.addNotNullQuery("sys_ui_section");
    el.query();

    while (el.next()) {
      var sec = el.sys_ui_section.getRefRecord();
      if (!sec || !sec.isValidRecord()) continue;

      var table = (sec.getValue("name") || "").toString();
      if (!viewsByTable[table]) continue;

      var viewId = (sec.getValue("view") || "").toString(); // '' = Default
      viewsByTable[table][viewId] = true;
    }

    return viewsByTable;
  }

  /************** STEP 3: Skip a (table, view) if life_cycle_stage exists anywhere in that view **************/
  function viewHasLifecycleStage(table, viewId) {
    var el = new GlideRecord("sys_ui_element");
    el.addQuery("sys_ui_section.name", table);
    if (viewId) el.addQuery("sys_ui_section.view", viewId);
    else el.addQuery("sys_ui_section.view", "");
    el.addQuery("element", CONFIG.LC_STAGE);
    el.setLimit(1);
    el.query();
    return el.next();
  }

  /************** STEP 4: Find anchor (earliest legacy element) for a (table, view) **************/
  function findAnchor(table, viewId) {
    // Returns { sectionSysId, pos, element, sys_id } or null
    var best = null;

    var el = new GlideRecord("sys_ui_element");
    el.addQuery("sys_ui_section.name", table);
    if (viewId) el.addQuery("sys_ui_section.view", viewId);
    else el.addQuery("sys_ui_section.view", "");
    el.addQuery("element", "IN", CONFIG.LEGACY_FIELDS.join(","));
    el.addNotNullQuery("sys_ui_section");
    el.query();

    while (el.next()) {
      var secId = (el.getValue("sys_ui_section") || "").toString();
      if (!secId) continue;

      var p = safeInt(el.getValue("position"));
      var cand = {
        sectionSysId: secId,
        pos: p,
        element: (el.getValue("element") || "").toString(),
        sys_id: el.getUniqueValue(),
      };

      if (!best || stableLess(cand, best)) best = cand;
    }

    return best;
  }

  /************** STEP 5: Shift positions inside the anchor section **************/
  function shiftSectionFromPosition(
    table,
    viewLabel,
    viewId,
    sectionSysId,
    anchorPos,
    delta
  ) {
    var el = new GlideRecord("sys_ui_element");
    el.addQuery("sys_ui_section", sectionSysId);
    el.addQuery("position", ">=", anchorPos);
    el.orderBy("position");
    el.query();

    while (el.next()) {
      var oldPos = safeInt(el.getValue("position"));
      var newPos = oldPos + delta;

      if (!CONFIG.APPLY) {
        addRow({
          table: table,
          view: viewLabel, // <-- display name
          action: "SHIFT_DRYRUN",
          section: sectionSysId,
          element: (el.getValue("element") || "").toString(),
          oldPos: oldPos,
          newPos: newPos,
          note: "",
        });
        continue;
      }

      el.setValue("position", newPos);
      el.update();

      addRow({
        table: table,
        view: viewLabel, // <-- display name
        action: "SHIFT_APPLIED",
        section: sectionSysId,
        element: (el.getValue("element") || "").toString(),
        oldPos: oldPos,
        newPos: newPos,
        note: "sys_ui_element=" + el.getUniqueValue(),
      });
    }
  }

  /************** STEP 6: Process a single (table, view) **************/
  function processTableView(table, viewId) {
    var viewLabel = getViewDisplay(viewId);

    if (viewHasLifecycleStage(table, viewId)) {
      addRow({
        table: table,
        view: viewLabel,
        action: "VIEW_SKIP",
        section: "",
        element: CONFIG.LC_STAGE,
        oldPos: "",
        newPos: "",
        note: "life_cycle_stage already present on view",
      });
      return;
    }

    var anchor = findAnchor(table, viewId);
    if (!anchor) {
      addRow({
        table: table,
        view: viewLabel,
        action: "VIEW_NO_LEGACY",
        section: "",
        element: "",
        oldPos: "",
        newPos: "",
        note: "",
      });
      return;
    }

    addRow({
      table: table,
      view: viewLabel,
      action: "VIEW_ANCHOR",
      section: anchor.sectionSysId,
      element: anchor.element,
      oldPos: "",
      newPos: anchor.pos,
      note: "sys_ui_element=" + anchor.sys_id,
    });

    // Shift first so anchorPos is free for LC fields
    shiftSectionFromPosition(
      table,
      viewLabel,
      viewId,
      anchor.sectionSysId,
      anchor.pos,
      2
    );

    // Insert LC pair (stage then status)
    insertElement(
      table,
      viewLabel,
      viewId,
      anchor.sectionSysId,
      CONFIG.LC_STAGE,
      anchor.pos
    );
    insertElement(
      table,
      viewLabel,
      viewId,
      anchor.sectionSysId,
      CONFIG.LC_STATUS,
      anchor.pos + 1
    );

    addRow({
      table: table,
      view: viewLabel,
      action: "VIEW_DONE",
      section: anchor.sectionSysId,
      element: "",
      oldPos: "",
      newPos: "",
      note: "LC inserted at pos " + anchor.pos,
    });
  }

  /************** MAIN **************/
  function run() {
    var tables = getTargetTables();
    addRow({
      table: "",
      view: "",
      action: "INFO",
      section: "",
      element: "",
      oldPos: "",
      newPos: "",
      note:
        "Target tables=" +
        tables.length +
        " (prefix=" +
        CONFIG.TABLE_PREFIX +
        ", extras=" +
        CONFIG.EXTRA_TABLES.join("|") +
        ")",
    });

    var viewsByTable = discoverViewsByTable(tables);

    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      var views = viewsByTable[table];
      if (!views) continue;

      var hadView = false;
      for (var viewId in views) {
        hadView = true;
        processTableView(table, viewId);
      }

      if (!hadView) {
        addRow({
          table: table,
          view: "",
          action: "TABLE_NO_VIEWS",
          section: "",
          element: "",
          oldPos: "",
          newPos: "",
          note: "No views with legacy fields found for this table",
        });
      }
    }

    printCsv();
  }

  run();
})();
