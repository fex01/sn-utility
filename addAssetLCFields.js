/**
 * Background Script (Prototype): Bulk adapt classic form layouts to display Lifecycle fields
 *
 * Purpose:
 * - Prototype to test feasibility of bulk form adaptation by manipulating sys_ui_element records.
 * - For selected tables, locate all form views where legacy asset status fields are used and
 *   insert lifecycle fields in their place.
 *
 * What it changes (per table + view + section):
 * - Identifies sections containing BOTH legacy fields: install_status and substatus
 * - Skips a (table, view) entirely if life_cycle_stage already exists anywhere in that view
 * - In each eligible section:
 *    1) Inserts life_cycle_stage at the ORIGINAL position of install_status
 *    2) Inserts life_cycle_stage_status at the ORIGINAL position of substatus
 *    3) Shifts existing elements to make space at both anchor positions:
 *         newPos = oldPos + (oldPos >= posInstall ? 1 : 0) + (oldPos >= posSub ? 1 : 0)
 *
 * How to use:
 * - Set CONFIG.APPLY=false to run a dry-run (prints a simple log of planned actions).
 * - Set CONFIG.APPLY=true to apply updates/inserts.
 * - Extend CONFIG.TABLES as needed.
 *
 * Notes:
 * - Default view is represented as sys_ui_section.view = '' (empty).
 * - This script targets classic form metadata (sys_ui_section/sys_ui_element).
 */

(function () {
  /************** CONFIG **************/
  var CONFIG = {
    APPLY: false, // false = dry-run logging, true = apply updates/inserts
    TABLES: ["alm_asset", "alm_hardware"], // extend easily
    LEGACY_INSTALL: "install_status",
    LEGACY_SUB: "substatus",
    LC_STAGE: "life_cycle_stage",
    LC_STATUS: "life_cycle_stage_status",
  };

  /************** HELPERS **************/
  function safeInt(x) {
    var n = parseInt(x, 10);
    return isNaN(n) ? 0 : n;
  }

  function log(msg) {
    gs.print(msg);
  }

  function elementExistsInSection(sectionSysId, elementName) {
    var ex = new GlideRecord("sys_ui_element");
    ex.addQuery("sys_ui_section", sectionSysId);
    ex.addQuery("element", elementName);
    ex.setLimit(1);
    ex.query();
    return ex.next();
  }

  function insertElement(sectionSysId, elementName, position) {
    if (elementExistsInSection(sectionSysId, elementName)) {
      log(
        "INSERT_SKIP section=" +
          sectionSysId +
          " element=" +
          elementName +
          " (already exists)"
      );
      return;
    }

    if (!CONFIG.APPLY) {
      log(
        "INSERT_DRYRUN section=" +
          sectionSysId +
          " element=" +
          elementName +
          " pos=" +
          position
      );
      return;
    }

    var ins = new GlideRecord("sys_ui_element");
    ins.initialize();
    ins.setValue("sys_ui_section", sectionSysId);
    ins.setValue("element", elementName);
    ins.setValue("position", position);
    var newId = ins.insert();
    log(
      "INSERT_APPLIED section=" +
        sectionSysId +
        " element=" +
        elementName +
        " pos=" +
        position +
        " sys_id=" +
        newId
    );
  }

  /************** STEP 1: Discover views per table where legacy fields exist **************/
  function discoverViewsByTable() {
    // viewsByTable[table][viewId] = true
    var viewsByTable = {};
    for (var i = 0; i < CONFIG.TABLES.length; i++)
      viewsByTable[CONFIG.TABLES[i]] = {};

    var el = new GlideRecord("sys_ui_element");
    el.addQuery(
      "element",
      "IN",
      CONFIG.LEGACY_INSTALL + "," + CONFIG.LEGACY_SUB
    );
    el.addQuery("sys_ui_section.name", "IN", CONFIG.TABLES.join(","));
    el.addNotNullQuery("sys_ui_section");
    el.query();

    while (el.next()) {
      var sec = el.sys_ui_section.getRefRecord();
      if (!sec || !sec.isValidRecord()) continue;

      var table = (sec.getValue("name") || "").toString();
      if (CONFIG.TABLES.indexOf(table) < 0) continue;

      var viewId = (sec.getValue("view") || "").toString(); // '' = Default
      viewsByTable[table][viewId] = true;
    }

    return viewsByTable;
  }

  /************** STEP 2: Skip a (table, view) if life_cycle_stage exists anywhere in that view **************/
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

  /************** STEP 3: Enumerate eligible sections for (table, view) **************/
  function sectionHasBothLegacyFields(sectionSysId) {
    var foundInstall = false;
    var foundSub = false;

    var el = new GlideRecord("sys_ui_element");
    el.addQuery("sys_ui_section", sectionSysId);
    el.addQuery(
      "element",
      "IN",
      CONFIG.LEGACY_INSTALL + "," + CONFIG.LEGACY_SUB
    );
    el.query();

    while (el.next()) {
      var f = (el.getValue("element") || "").toString();
      if (f === CONFIG.LEGACY_INSTALL) foundInstall = true;
      if (f === CONFIG.LEGACY_SUB) foundSub = true;
      if (foundInstall && foundSub) return true;
    }
    return false;
  }

  function getSectionsForTableView(table, viewId) {
    var sections = [];
    var sec = new GlideRecord("sys_ui_section");
    sec.addQuery("name", table);
    if (viewId) sec.addQuery("view", viewId);
    else sec.addQuery("view", "");
    sec.query();

    while (sec.next()) {
      var secId = sec.getUniqueValue();
      if (sectionHasBothLegacyFields(secId)) sections.push(secId);
    }
    return sections;
  }

  /************** STEP 4: Adapt one section (shift then insert) **************/
  function getAnchorPositions(sectionSysId) {
    var posInstall = null;
    var posSub = null;

    var el = new GlideRecord("sys_ui_element");
    el.addQuery("sys_ui_section", sectionSysId);
    el.addQuery(
      "element",
      "IN",
      CONFIG.LEGACY_INSTALL + "," + CONFIG.LEGACY_SUB
    );
    el.query();

    while (el.next()) {
      var f = (el.getValue("element") || "").toString();
      var p = safeInt(el.getValue("position"));
      if (f === CONFIG.LEGACY_INSTALL) posInstall = p;
      if (f === CONFIG.LEGACY_SUB) posSub = p;
    }

    return { posInstall: posInstall, posSub: posSub };
  }

  function shiftPositions(sectionSysId, posInstall, posSub) {
    var el = new GlideRecord("sys_ui_element");
    el.addQuery("sys_ui_section", sectionSysId);
    el.orderBy("position");
    el.query();

    while (el.next()) {
      var oldPos = safeInt(el.getValue("position"));
      var delta = 0;

      if (oldPos >= posInstall) delta++;
      if (oldPos >= posSub) delta++;

      if (delta === 0) continue;

      var newPos = oldPos + delta;

      if (!CONFIG.APPLY) {
        log(
          "SHIFT_DRYRUN section=" +
            sectionSysId +
            " element=" +
            el.getValue("element") +
            " " +
            oldPos +
            "->" +
            newPos
        );
        continue;
      }

      el.setValue("position", newPos);
      el.update();
      log(
        "SHIFT_APPLIED section=" +
          sectionSysId +
          " element=" +
          el.getValue("element") +
          " " +
          oldPos +
          "->" +
          newPos
      );
    }
  }

  function adaptSection(sectionSysId) {
    var anchors = getAnchorPositions(sectionSysId);
    if (anchors.posInstall === null || anchors.posSub === null) {
      log(
        "SECTION_SKIP section=" +
          sectionSysId +
          " (missing install_status or substatus)"
      );
      return;
    }

    // Shift first so original anchor positions become available for LC fields
    shiftPositions(sectionSysId, anchors.posInstall, anchors.posSub);

    // Insert LC fields at original anchor positions
    insertElement(sectionSysId, CONFIG.LC_STAGE, anchors.posInstall);
    insertElement(sectionSysId, CONFIG.LC_STATUS, anchors.posSub);

    log(
      "SECTION_DONE section=" +
        sectionSysId +
        " inserted " +
        CONFIG.LC_STAGE +
        "@" +
        anchors.posInstall +
        ", " +
        CONFIG.LC_STATUS +
        "@" +
        anchors.posSub
    );
  }

  /************** MAIN **************/
  function run() {
    var viewsByTable = discoverViewsByTable();

    for (var i = 0; i < CONFIG.TABLES.length; i++) {
      var table = CONFIG.TABLES[i];

      for (var viewId in viewsByTable[table]) {
        if (viewHasLifecycleStage(table, viewId)) {
          log(
            "VIEW_SKIP table=" +
              table +
              " view=" +
              (viewId || "Default") +
              " (life_cycle_stage already present)"
          );
          continue;
        }

        var sections = getSectionsForTableView(table, viewId);
        if (sections.length === 0) {
          log(
            "VIEW_NO_SECTIONS table=" + table + " view=" + (viewId || "Default")
          );
          continue;
        }

        log(
          "VIEW_PROCESS table=" +
            table +
            " view=" +
            (viewId || "Default") +
            " sections=" +
            sections.length
        );

        for (var s = 0; s < sections.length; s++) {
          adaptSection(sections[s]);
        }
      }
    }

    log("---");
    log("Mode: " + (CONFIG.APPLY ? "APPLY" : "DRY-RUN"));
  }

  run();
})();
