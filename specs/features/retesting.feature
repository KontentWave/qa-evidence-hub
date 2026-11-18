@phase1 @S2 @AC04
Feature: Retest the same finding across sessions

  Background:
    Given I am signed in as the provisioned owner
    And active project "Checkout QA" contains finding "Payment submission fails"

  Scenario: Request a retest with an explicit reason
    Given the finding is "Open"
    When I request a retest with note "Client reports a fix in build 42"
    Then its status is "Awaiting Retest"
    And its status history records the transition, note, owner and time

  Scenario Outline: Record the outcome without replacing the original finding
    Given the finding is "Awaiting Retest"
    And a later session in "Checkout QA" has Ready evidence "Retest capture"
    When I record outcome "<outcome>" with notes and "Retest capture" in that session
    Then the same finding has status "<status>"
    And one append-only retest records the session, outcome, notes and evidence
    And the original evidence and previous status history remain accessible

    Examples:
      | outcome | status          |
      | Pass    | Verified Fixed  |
      | Fail    | Open            |
      | Blocked | Awaiting Retest |

  Scenario: Prevent direct verification without a passing retest
    Given the finding is "Open"
    When I submit a direct status change to "Verified Fixed"
    Then the request is rejected
    And the finding remains "Open"
    And no retest or status event is created

  Scenario: Require same-project evidence for a retest
    Given the finding is "Awaiting Retest"
    When I submit a passing retest without ready same-project evidence
    Then no retest or status event is created
    And the finding remains "Awaiting Retest"

  Scenario Outline: Reopen a closed finding without erasing its history
    Given the finding is "<status>"
    When I reopen it with reason "New evidence requires another investigation"
    Then its status is "Open"
    And the reopening reason is recorded
    And the preceding evidence, retests and events remain accessible

    Examples:
      | status         |
      | Verified Fixed |
      | Rejected       |

  Scenario: Reject a finding with a reason
    Given the finding is "Awaiting Retest"
    When I reject it with reason "Confirmed expected behavior for this build"
    Then its status is "Rejected"
    And its evidence is retained
    And its history includes the rejection reason

  Scenario: Commit a retest and its status change together
    Given the finding is "Awaiting Retest"
    And a valid passing retest is ready to save
    When a database failure occurs while saving its status event
    Then neither the retest nor the status event is committed
    And the finding remains "Awaiting Retest"

  Scenario: Ignore a repeated successful retest submission
    Given a passing retest was saved successfully with an operation ID
    When the same operation is submitted again
    Then the original retest result is returned
    And no duplicate retest or status event is created
