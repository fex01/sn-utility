// --- CONFIGURE THESE PAIRS ---
var groupPairs = [
  // [ oldGroupName,                    newGroupName ]
  ["oldGroupName", "newGroupName"],
  // add additional [oldName, newName] pairs here if needed
];

// function that remaps all memberships from one group to another,
// counts valid vs invalid entries, and deactivates the old group
function mapGroupMembership(oldGroupName, newGroupName) {
  // find source group
  var oldGR = new GlideRecord("sys_user_group");
  oldGR.addQuery("name", oldGroupName);
  oldGR.query();
  if (!oldGR.next()) {
    gs.error("Source group not found: " + oldGroupName);
    throw "Stopping script: source group not found";
  }
  var oldSysId = oldGR.getValue("sys_id");

  // find target group
  var newGR = new GlideRecord("sys_user_group");
  newGR.addQuery("name", newGroupName);
  newGR.query();
  if (!newGR.next()) {
    gs.error("Target group not found: " + newGroupName);
    throw "Stopping script: target group not found";
  }
  var newSysId = newGR.getValue("sys_id");

  // re-map memberships
  var m = new GlideRecord("sys_user_grmember");
  m.addQuery("group", oldSysId);
  m.query();

  var validCount = 0;
  var invalidCount = 0;
  while (m.next()) {
    var userId = m.getValue("user");
    // delete old record regardless
    m.deleteRecord();

    // attempt to insert new only if user reference is valid
    var userGR = new GlideRecord("sys_user");
    if (userId && userGR.get(userId)) {
      var nr = new GlideRecord("sys_user_grmember");
      nr.initialize();
      nr.setValue("user", userId);
      nr.setValue("group", newSysId);
      nr.insert();
      validCount++;
    } else {
      invalidCount++;
    }
  }

  // deactivate the old group
  oldGR.setValue("active", false);
  oldGR.update();

  // summary
  gs.info(
    'Group "' +
      oldGroupName +
      '" → "' +
      newGroupName +
      '": ' +
      validCount +
      " memberships recreated; " +
      invalidCount +
      " invalid records deleted; " +
      "old group deactivated."
  );
}

// iterate over all configured pairs
for (var i = 0; i < groupPairs.length; i++) {
  mapGroupMembership(groupPairs[i][0], groupPairs[i][1]);
}
