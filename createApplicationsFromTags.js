(function () {
  // 1. Gather all unique tag values and associated server sys_ids.
  var tagMap = {}; // Example structure: { "<tagValue>": [ "<serverSysId1>", "<serverSysId2>", ... ] }

  var grTag = new GlideRecord("cmdb_key_value");
  grTag.addQuery("key", "ewerk_import_appl_tag");
  grTag.query();
  while (grTag.next()) {
    var tagValue = grTag.getValue("value");

    // (3) Skip any record that doesn't have a valid tag value.
    //     if (!tagValue) { ... continue; } means:
    //     "If the tagValue is null/empty, do not process this record.
    //      Move on to the next record in the loop."
    if (!tagValue) {
      continue;
    }

    var serverSysId = grTag.getValue("configuration_item");
    if (!serverSysId) {
      // If there's no associated CI, skip this record
      continue;
    }

    // 2. Ensure the configuration_item is a Server or extends Server class
    var ciGR = new GlideRecord("cmdb_ci");
    if (ciGR.get(serverSysId)) {
      // Use instanceOf() to confirm it's cmdb_ci_server or a subclass
      if (ciGR.instanceOf("cmdb_ci_server")) {
        // Build our tagMap
        if (!tagMap[tagValue]) {
          tagMap[tagValue] = [];
        }
        tagMap[tagValue].push(serverSysId);
      }
    }
  }

  // 3. For each unique tag value, create an Application record and relationships
  for (var value in tagMap) {
    // 3a. Create a new Application (cmdb_ci_appl)
    var appGR = new GlideRecord("cmdb_ci_appl");
    appGR.initialize();
    appGR.name = value; // set the app name to the tag value
    var appSysId = appGR.insert();

    gs.print('Created application "' + value + '" with sys_id: ' + appSysId);

    // 3b. Create a "Runs on::Runs" relationship for each matching Server
    var serverList = tagMap[value];
    for (var i = 0; i < serverList.length; i++) {
      var relGR = new GlideRecord("cmdb_rel_ci");
      relGR.initialize();
      // (4) Use the relationship type by name (display value)
      relGR.type.setDisplayValue("Runs on::Runs");
      relGR.parent = appSysId; // The new application
      relGR.child = serverList[i]; // The server
      var relSysId = relGR.insert();

      gs.print(
        "    Created relationship (Runs on::Runs) between App: " +
          appSysId +
          " and Server: " +
          serverList[i] +
          " [rel sys_id: " +
          relSysId +
          "]"
      );
    }
  }

  gs.print("Script completed. Applications and relationships created.");
})();
