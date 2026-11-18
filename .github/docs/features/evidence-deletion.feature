@phase1 @S1 @AC08
Feature: Deliberately remove evidence while explaining affected records

  Background:
    Given I am signed in as the provisioned owner
    And an evidence item is linked to two findings

  Scenario: Cancel deletion after seeing its impact
    When I request deletion of the evidence item
    Then the confirmation identifies two affected findings
    When I cancel the confirmation
    Then the evidence and its links remain unchanged

  Scenario: Delete evidence without silently discarding findings
    When I confirm deletion of the evidence item
    And the storage provider confirms file removal
    Then the source file and any temporary copies or previews are removed from active application storage
    And sensitive evidence metadata is erased
    And a minimal Deleted tombstone explains the existing links
    And both findings remain with their prior statuses
    And their reports state that the linked evidence was deleted
    And I cannot create a new link to the deleted evidence

  Scenario: Keep a failed provider deletion visibly incomplete
    Given the storage provider will fail the first deletion attempt
    When I confirm evidence deletion
    Then the evidence is DeletionPending and unavailable through application downloads
    And I see that deletion is incomplete with a retry action
    When the provider recovers and I retry deletion
    Then the same deletion operation completes
    And the evidence becomes Deleted without duplicate tombstones
