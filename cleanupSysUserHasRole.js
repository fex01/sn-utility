// Background script: deletes sys_user_has_role rows where:
//  - user is empty, OR
//  - user sys_id does not resolve to an existing sys_user record
//
// Default is DRY RUN. Set DRY_RUN = false to actually delete.

(function () {
  var DRY_RUN = true; // <-- set to false to delete
  var BATCH_LOG_EVERY = 500;

  var totalScanned = 0;
  var emptyUserCount = 0;
  var invalidUserCount = 0;
  var deletedCount = 0;

  var userCache = {}; // sys_id -> true/false (exists)

  function userExists(userSysId) {
    if (!userSysId) return false;
    if (userCache.hasOwnProperty(userSysId)) return userCache[userSysId];

    var u = new GlideRecord("sys_user");
    var exists = u.get(userSysId) === true;
    userCache[userSysId] = exists;
    return exists;
  }

  gs.print("Starting cleanup of sys_user_has_role. DRY_RUN=" + DRY_RUN);

  var gr = new GlideRecord("sys_user_has_role");
  gr.setWorkflow(false);
  gr.autoSysFields(false);
  gr.query();

  while (gr.next()) {
    totalScanned++;

    var userId = gr.getValue("user"); // sys_id or empty
    var shouldDelete = false;

    if (!userId) {
      emptyUserCount++;
      shouldDelete = true;
    } else if (!userExists(userId)) {
      invalidUserCount++;
      shouldDelete = true;
    }

    if (shouldDelete) {
      if (DRY_RUN) {
        gs.print(
          "[DRY RUN] Would delete sys_user_has_role: " +
            gr.getUniqueValue() +
            " (user=" +
            (userId || "<empty>") +
            ")",
        );
      } else {
        gr.deleteRecord();
        deletedCount++;
      }
    }

    if (totalScanned % BATCH_LOG_EVERY === 0) {
      gs.print(
        "Scanned=" +
          totalScanned +
          ", emptyUser=" +
          emptyUserCount +
          ", invalidUser=" +
          invalidUserCount +
          ", deleted=" +
          deletedCount,
      );
    }
  }

  gs.print(
    "Finished. Scanned=" +
      totalScanned +
      ", emptyUser=" +
      emptyUserCount +
      ", invalidUser=" +
      invalidUserCount +
      ", deleted=" +
      deletedCount +
      ", DRY_RUN=" +
      DRY_RUN,
  );
})();
