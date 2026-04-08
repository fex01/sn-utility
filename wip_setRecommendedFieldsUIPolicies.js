(function () {
  var classToFieldNames = {
    cmdb_ci_win_server: [
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

  var uiPolicyNamePrefix = "CMDB - Recommended Fields Mandatory in UI - ";
  var tableName;

  for (tableName in classToFieldNames) {
    if (!classToFieldNames.hasOwnProperty(tableName)) {
      continue;
    }

    var fieldNameList = classToFieldNames[tableName];
    var uiPolicySysId = ensureUiPolicy(
      tableName,
      uiPolicyNamePrefix + tableName,
    );

    if (!uiPolicySysId) {
      gs.error("Failed to create or update UI Policy for table: " + tableName);
      continue;
    }

    deleteExistingUiPolicyActions(uiPolicySysId);
    createUiPolicyActions(uiPolicySysId, tableName, fieldNameList);
  }

  function ensureUiPolicy(tableName, uiPolicyShortDescription) {
    var grUiPolicy = new GlideRecord("sys_ui_policy");
    grUiPolicy.addQuery("table", tableName);
    grUiPolicy.addQuery("short_description", uiPolicyShortDescription);
    grUiPolicy.setLimit(1);
    grUiPolicy.query();

    if (grUiPolicy.next()) {
      grUiPolicy.setValue("active", true);
      grUiPolicy.setValue("on_load", true);
      grUiPolicy.setValue("reverse_if_false", false);
      grUiPolicy.setValue("inherit", false);
      grUiPolicy.setValue("global", true);

      // Leave conditions blank intentionally so the policy applies generally in the UI.
      grUiPolicy.setValue("conditions", "");
      grUiPolicy.update();

      gs.info("Updated UI Policy: " + uiPolicyShortDescription);
      return grUiPolicy.getUniqueValue();
    }

    grUiPolicy.initialize();
    grUiPolicy.setValue("table", tableName);
    grUiPolicy.setValue("short_description", uiPolicyShortDescription);
    grUiPolicy.setValue("active", true);
    grUiPolicy.setValue("on_load", true);
    grUiPolicy.setValue("reverse_if_false", false);
    grUiPolicy.setValue("inherit", false);
    grUiPolicy.setValue("global", true);
    grUiPolicy.setValue("conditions", "");

    var insertedUiPolicySysId = grUiPolicy.insert();
    if (insertedUiPolicySysId) {
      gs.info("Inserted UI Policy: " + uiPolicyShortDescription);
    }

    return insertedUiPolicySysId;
  }

  function deleteExistingUiPolicyActions(uiPolicySysId) {
    var grUiPolicyAction = new GlideRecord("sys_ui_policy_action");
    grUiPolicyAction.addQuery("ui_policy", uiPolicySysId);
    grUiPolicyAction.query();

    while (grUiPolicyAction.next()) {
      grUiPolicyAction.deleteRecord();
    }
  }

  function createUiPolicyActions(uiPolicySysId, tableName, fieldNameList) {
    var grTableDescriptor = new GlideRecord(tableName);
    var index;

    for (index = 0; index < fieldNameList.length; index++) {
      var fieldName = fieldNameList[index];

      if (!grTableDescriptor.isValidField(fieldName)) {
        gs.warn(
          "Skipped invalid field [" +
            fieldName +
            "] on table [" +
            tableName +
            "]",
        );
        continue;
      }

      var grUiPolicyAction = new GlideRecord("sys_ui_policy_action");
      grUiPolicyAction.initialize();
      grUiPolicyAction.setValue("ui_policy", uiPolicySysId);
      grUiPolicyAction.setValue("table", tableName);
      grUiPolicyAction.setValue("field", fieldName);

      // UI-only mandatory
      grUiPolicyAction.setValue("mandatory", "true");

      // Leave visibility and read-only unchanged
      grUiPolicyAction.setValue("visible", "ignore");
      grUiPolicyAction.setValue("disabled", "ignore");

      grUiPolicyAction.insert();
      gs.info("Added UI Policy Action: " + tableName + "." + fieldName);
    }
  }
})();
