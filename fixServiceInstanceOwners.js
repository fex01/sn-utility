(function backfillServiceInstanceOwnedByFromBusinessApplication() {
  /*
   * Purpose:
   * Backfill owned_by on automated Service Instances from the related
   * Business Application's IT Application Owner.
   *
   * Scope:
   * - Parent CI: Business Application, cmdb_ci_business_app
   * - Child CI: Service Instance, cmdb_ci_service_auto and child tables
   * - Relationship table: cmdb_rel_ci
   * - Relationship type: Consumes::Consumed by
   * - Only updates Service Instances where owned_by is empty
   *
   * Recommended usage:
   * 1. Run with isDryRun = true in sub-prod.
   * 2. Review the logs.
   * 3. Run with isDryRun = false after approval.
   */

  var isDryRun = true;
  var suppressWorkflow = true;

  var businessApplicationTable = "cmdb_ci_business_app";
  var serviceInstanceTable = "cmdb_ci_service_auto";
  var relationshipTable = "cmdb_rel_ci";

  var relationshipTypeSysId = "41008aa6ef32010098d5925495c0fb94"; // Consumes::Consumed by

  var businessApplicationOwnerField = "it_application_owner";
  var serviceInstanceOwnerField = "owned_by";

  var updatedCount = 0;
  var wouldUpdateCount = 0;
  var skippedAlreadyOwnedCount = 0;
  var skippedMissingServiceInstanceCount = 0;

  var grBusinessApplication = new GlideRecord(businessApplicationTable);
  grBusinessApplication.addNotNullQuery(businessApplicationOwnerField);
  grBusinessApplication.query();

  while (grBusinessApplication.next()) {
    processBusinessApplication(grBusinessApplication);
  }

  gs.info(
    "Fix Script complete. Dry run: " +
      isDryRun +
      ". Updated: " +
      updatedCount +
      ". Would update: " +
      wouldUpdateCount +
      ". Skipped already owned: " +
      skippedAlreadyOwnedCount +
      ". Skipped missing/non-service-instance child: " +
      skippedMissingServiceInstanceCount +
      ".",
  );

  /**
   * Finds qualifying Service Instance relationships for one Business Application.
   *
   * @param {GlideRecord} grBusinessApplication - Business Application record.
   */
  function processBusinessApplication(grBusinessApplication) {
    var businessApplicationSysId = grBusinessApplication.getUniqueValue();
    var businessApplicationOwnerSysId = grBusinessApplication.getValue(
      businessApplicationOwnerField,
    );

    var grConfigurationItemRelationship = new GlideRecord(relationshipTable);
    grConfigurationItemRelationship.addQuery(
      "parent",
      businessApplicationSysId,
    );
    grConfigurationItemRelationship.addQuery("type", relationshipTypeSysId);
    grConfigurationItemRelationship.addNotNullQuery("child");
    grConfigurationItemRelationship.query();

    while (grConfigurationItemRelationship.next()) {
      processServiceInstanceRelationship(
        grConfigurationItemRelationship,
        grBusinessApplication,
        businessApplicationOwnerSysId,
      );
    }
  }

  /**
   * Updates the child Service Instance owned_by value when it is empty.
   *
   * @param {GlideRecord} grConfigurationItemRelationship - Relationship record from cmdb_rel_ci.
   * @param {GlideRecord} grBusinessApplication - Parent Business Application record.
   * @param {string} businessApplicationOwnerSysId - IT Application Owner sys_id from the Business Application.
   */
  function processServiceInstanceRelationship(
    grConfigurationItemRelationship,
    grBusinessApplication,
    businessApplicationOwnerSysId,
  ) {
    var serviceInstanceSysId =
      grConfigurationItemRelationship.getValue("child");

    var grServiceInstance = new GlideRecord(serviceInstanceTable);

    /*
     * Querying the base Service Instance table also finds records on child
     * tables that extend cmdb_ci_service_auto.
     */
    if (!grServiceInstance.get(serviceInstanceSysId)) {
      skippedMissingServiceInstanceCount++;
      return;
    }

    /*
     * Do not overwrite existing ownership.
     */
    if (grServiceInstance.getValue(serviceInstanceOwnerField)) {
      skippedAlreadyOwnedCount++;
      return;
    }

    if (isDryRun) {
      wouldUpdateCount++;

      gs.info(
        'Dry run: would set owned_by on Service Instance "' +
          grServiceInstance.getDisplayValue() +
          '" [' +
          grServiceInstance.getUniqueValue() +
          '] to "' +
          grBusinessApplication.getDisplayValue(businessApplicationOwnerField) +
          '" from Business Application "' +
          grBusinessApplication.getDisplayValue() +
          '" [' +
          grBusinessApplication.getUniqueValue() +
          "].",
      );

      return;
    }

    grServiceInstance.setValue(
      serviceInstanceOwnerField,
      businessApplicationOwnerSysId,
    );

    /*
     * Suppress Business Rules, Flows, notifications, and other workflow
     * processing during this controlled data backfill.
     */
    if (suppressWorkflow) {
      grServiceInstance.setWorkflow(false);
    }

    grServiceInstance.update();
    updatedCount++;
  }
})();
