(function executeBackgroundScript() {
  // Table for Dynamic CI Groups
  var dynamicCIGroupTable = "cmdb_ci_query_based_service";

  // Get the sys_id of the relationship type
  var relTypeGR = new GlideRecord("cmdb_rel_type");
  relTypeGR.addQuery("name", "Contains::Contained by"); // Ensure correct name
  relTypeGR.query();
  var relTypeSysId = "";
  if (relTypeGR.next()) {
    relTypeSysId = relTypeGR.getValue("sys_id");
  } else {
    gs.print(
      'Relationship type "Contains::Contained by" not found. Check the name in cmdb_rel_type.'
    );
    return;
  }

  // Initialize GlideRecord for Dynamic CI Groups
  var dynamicCIGroupGR = new GlideRecord(dynamicCIGroupTable);
  dynamicCIGroupGR.query();

  var result = []; // Array to hold Dynamic CI Groups with multiple related Service Offerings

  while (dynamicCIGroupGR.next()) {
    var groupSysId = dynamicCIGroupGR.getValue("sys_id");
    var groupName = dynamicCIGroupGR.getValue("name");

    // Query cmdb_rel_ci to find related Service Offerings
    var relGR = new GlideRecord("cmdb_rel_ci");
    relGR.addQuery("child", groupSysId); // Current Dynamic CI Group as child
    relGR.addQuery("type", relTypeSysId); // Use the sys_id of the relationship type
    relGR.query();

    var relatedServiceOfferings = [];
    while (relGR.next()) {
      // Fetch the name of the Service Offering (parent)
      var serviceOfferingGR = new GlideRecord("cmdb_ci_service");
      if (serviceOfferingGR.get(relGR.getValue("parent"))) {
        relatedServiceOfferings.push(serviceOfferingGR.getValue("name"));
      }
    }

    // If more than one Service Offering is related, add to the result array
    if (relatedServiceOfferings.length > 1) {
      result.push({
        groupName: groupName,
        groupSysId: groupSysId,
        serviceOfferingsCount: relatedServiceOfferings.length,
        serviceOfferings: relatedServiceOfferings,
      });
    }
  }

  // Print the result
  if (result.length > 0) {
    gs.print("Dynamic CI Groups with more than one related Service Offering:");
    result.forEach(function (group) {
      gs.print(
        "Name: " +
          group.groupName +
          ", Sys ID: " +
          group.groupSysId +
          ", Related Service Offerings Count: " +
          group.serviceOfferingsCount +
          ", Related Service Offerings: " +
          group.serviceOfferings.join(", ")
      );
    });
  } else {
    gs.print(
      "No Dynamic CI Groups with more than one related Service Offering found."
    );
  }
})();
