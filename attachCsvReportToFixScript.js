/**
 * Fix Script: Attach a generated CSV report to a specific Fix Script record
 *
 * What this does:
 * - Builds CSV content (header + rows)
 * - Attaches it as a .csv file to a Fix Script record (sys_script_fix) identified by a hardcoded sys_id
 *
 * How to use:
 * 1) Create/open your Fix Script record (System Definition > Fix Scripts).
 * 2) Copy/paste this script into the Fix Script.
 * 3) Set FIX_SCRIPT_SYS_ID to the sys_id of the Fix Script record that should receive the attachment.
 * 4) Replace buildCsvLines() with your real CSV output.
 * 5) Run the Fix Script and download the attachment from the Fix Script record.
 */
(function executeFixScript() {
  /************** CONFIG **************/
  var FIX_SCRIPT_SYS_ID = "PUT_SYS_ID_HERE_32_CHARS";
  var FILE_BASENAME = "Update_Asset_forms";
  var CONTENT_TYPE = "text/csv";

  /************** CSV CONTENT **************/
  // Replace this function with your real report generation.
  function buildCsvLines() {
    return [
      "Table;View;Action;SectionSysId;Element;OldPos;NewPos;Note",
      "alm_asset;Default;INFO;;;;;Example row",
    ];
  }

  /************** ATTACHMENT **************/
  function safeTimestamp() {
    return gs.nowDateTime().replace(/[: ]/g, "_"); // "YYYY-MM-DD_HH_mm_ss"
  }

  function attachCsvToFixScript(fixScriptSysId, lines) {
    var fix = new GlideRecord("sys_script_fix");
    if (!fix.get(fixScriptSysId)) {
      gs.error("Fix Script record not found: " + fixScriptSysId);
      return;
    }

    var fileName = FILE_BASENAME + "_" + safeTimestamp() + ".csv";
    var csvContent = (lines || []).join("\r\n"); // CRLF for Excel/Windows compatibility

    var att = new GlideSysAttachment();
    var attachmentSysId = att.write(fix, fileName, CONTENT_TYPE, csvContent);

    gs.info(
      "CSV attached to Fix Script [" +
        fix.getDisplayValue() +
        "] as [" +
        fileName +
        "], attachment sys_id=" +
        attachmentSysId,
    );
  }

  /************** RUN **************/
  attachCsvToFixScript(FIX_SCRIPT_SYS_ID, buildCsvLines());
})();
