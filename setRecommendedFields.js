(function () {
  var classToRecommendedFields = {
    cmdb_ci_win_server: [
      "os",
      "serial_number",
      "asset",
      "asset_tag",
      "ip_address",
      "model_id",
      "os_version",
      "support_group",
      "assignment_group", // corrected
      "managed_by_group",
      "name",
    ],
    cmdb_ci_linux_server: [
      "os",
      "serial_number",
      "asset",
      "asset_tag",
      "ip_address",
      "model_id",
      "os_version",
      "support_group",
      "assignment_group",
      "managed_by_group",
      "name",
    ],
    cmdb_ci_computer: [
      "os",
      "serial_number",
      "asset",
      "asset_tag",
      "ip_address",
      "model_id",
      "os_version",
      "support_group",
      "assignment_group",
      "managed_by_group",
      "name",
    ],
  };

  var tableName;
  for (tableName in classToRecommendedFields) {
    if (!classToRecommendedFields.hasOwnProperty(tableName)) {
      continue;
    }

    var recommendedFieldList = classToRecommendedFields[tableName].join(",");

    var grRecommendedField = new GlideRecord("cmdb_recommended_fields");
    grRecommendedField.addQuery("table", tableName);
    grRecommendedField.query();

    if (grRecommendedField.next()) {
      grRecommendedField.setValue("recommended", recommendedFieldList);
      grRecommendedField.update();
      gs.info("Updated: " + tableName);
    } else {
      grRecommendedField.initialize();
      grRecommendedField.setValue("table", tableName);
      grRecommendedField.setValue("recommended", recommendedFieldList);
      grRecommendedField.insert();
      gs.info("Inserted: " + tableName);
    }
  }
})();
