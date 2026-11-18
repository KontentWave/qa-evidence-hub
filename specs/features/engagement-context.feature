@phase1 @AC01
Feature: Establish and revisit a testing engagement
  The owner can organize testing without separate project notes.

  Background:
    Given I am signed in as the provisioned owner

  @S1
  Scenario: Create a client, project and test session
    When I create client "Example Client"
    And I create active project "Checkout QA" for that client
    And I create a session for that project with purpose "Checkout regression" and start "2026-10-06T09:00:00Z"
    Then the session is listed under "Checkout QA"
    And reopening the session shows its saved purpose and start time

  @S1
  Scenario: Reject an invalid session time range
    Given active project "Checkout QA" exists
    When I submit a session ending before its start time
    Then no session is created
    And the form identifies the invalid end time
    And the other non-sensitive entered values remain available

  @S2
  Scenario: Archive a client without losing its projects
    Given client "Example Client" has active project "Checkout QA" containing findings
    When I archive "Example Client"
    Then "Checkout QA" is archived and remains readable
    And its report remains printable
    And creating a project under the archived client is rejected
    And adding evidence to "Checkout QA" is rejected by the server

  @S2
  Scenario: Unarchiving a client does not silently reactivate projects
    Given client "Example Client" and its project "Checkout QA" are archived
    When I unarchive "Example Client"
    Then "Checkout QA" remains archived until explicitly unarchived

  @S2
  Scenario: Correct session details without rewriting a finding's recorded environment
    Given a finding was created from a session with browser "Safari"
    When I correct that session's browser to "Firefox"
    Then the session shows "Firefox"
    And the finding's captured environment still shows "Safari"
