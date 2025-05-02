/**
 * Deletes the sys_number_counter entry for a given table to reset its counter.
 * - If no record is found: logs an info and skips.
 * - If multiple records are found: logs an error and halts the script.
 * Deleting the counter record causes ServiceNow to recreate it on next insert,
 * resetting the counter back to its start value.
 *
 * @param {string} tableName  The name of the table whose counter entry you want to delete
 */
function resetTableCounter(tableName) {
  var grSysNumberCounter = new GlideRecord("sys_number_counter");
  grSysNumberCounter.addQuery("table", tableName);
  grSysNumberCounter.query();

  if (!grSysNumberCounter.next()) {
    gs.info(tableName + ": no counter record – skipping");
    return;
  }
  if (grSysNumberCounter.hasNext()) {
    gs.error(tableName + ": multiple counter records – halting script");
    throw tableName + ": multiple counter records found";
  }

  // Delete the counter record to reset it
  grSysNumberCounter.deleteRecord();
  gs.info(tableName + ": counter record deleted (counter reset)");
}

// ————————————————
// Array of tables to reset
var tableNames = [
  "interaction",
  "incident",
  "problem",
  "problem_task",
  "change_request",
  "change_task",
  "sc_request", // Request
  "sc_req_item", // Requested Item
  "sc_task", // Catalog Task
];

// Execute for each table; any thrown error will stop the script
for (var i = 0; i < tableNames.length; i++) {
  resetTableCounter(tableNames[i]);
}
