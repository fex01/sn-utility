/**
 * Deletes all records in the specified table.
 *
 * @param {string} tableName  The name of the table from which to delete all records
 */
function deleteAllRecords(tableName) {
  var grRecords = new GlideRecord(tableName);
  grRecords.query();

  if (!grRecords.hasNext()) {
    gs.info(tableName + ": no records to delete");
    return;
  }

  var deletedCount = 0;
  while (grRecords.next()) {
    grRecords.deleteRecord();
    deletedCount++;
  }

  gs.info(tableName + ": deleted " + deletedCount + " record(s)");
}

// ————————————————
// Array of tables to clear out
var tableNames = [
  "interaction",
  "interaction_log",
  "incident",
  "problem",
  "problem_task",
  "change_request",
  "change_task",
  "sc_request", // Request
  "sc_req_item", // Requested Item
  "sc_task", // Catalog Task
  "sys_email",
];

// Execute for each table
for (var i = 0; i < tableNames.length; i++) {
  deleteAllRecords(tableNames[i]);
}
