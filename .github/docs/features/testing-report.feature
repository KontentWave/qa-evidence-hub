@phase1 @AC06
Feature: Reuse saved evidence in a project report

  Background:
    Given I am signed in as the provisioned owner

  @S1 @smoke
  Scenario: Complete the capture-to-report journey
    When I create a client, an active project and a test session
    And I upload a valid screenshot to that session
    And I create a complete High severity finding linked to the screenshot
    And I open the project's report
    Then it contains the client, project and session information
    And it contains the finding's steps, expected result, actual result and Open status
    And it displays the screenshot with its caption and source context
    And it shows its generation time and project-wide scope
    And I can open the browser print view without application navigation

  @S2
  Scenario: Generate a report with findings, observations and retest history
    Given a project contains findings of different severities and statuses
    And it contains observations, text evidence, URL evidence and a file attachment
    And one finding has a recorded retest
    When I open its default report
    Then all finding statuses and observations are included
    And the report shows accurate counts by severity and status
    And it includes the recorded retest outcome and notes
    And text evidence is escaped and URL context is sanitized
    And the file attachment uses an authenticated application download link

  @S2
  Scenario: Filter a report by a later retest session
    Given a finding originated in session "Regression 1" and was retested in "Regression 2"
    And a separate finding has neither origin nor retest in "Regression 2"
    And one observation has no session and another belongs only to "Regression 1"
    When I generate a report scoped to "Regression 2"
    Then the retested finding is included with its labeled origin and full retest history
    And evidence linked to that finding retains its source-session label
    And the separate finding is excluded
    And the sessionless observation is included as project-wide
    And the observation belonging only to "Regression 1" is excluded

  @S1
  Scenario: Show an honest warning when linked evidence is unavailable
    Given a project finding has a linked screenshot whose provider file is inaccessible
    When I open the project's report
    Then the finding remains in the report
    And its evidence area shows "Evidence unavailable"
    And no public provider link or successful-embedding claim is substituted

  @S2
  Scenario: Regenerate a report from current saved state
    Given a report was generated while a finding was "Open"
    And the finding subsequently completed a passing retest
    When I generate the report again
    Then it shows "Verified Fixed" and the new generation time
    And it does not claim to be the earlier report's immutable version

  @S2
  Scenario: Locate a finding using project-scoped filters
    Given two projects contain findings titled "Payment error"
    And only one finding in "Checkout QA" is both Open and High severity
    When I filter "Checkout QA" findings by title "payment", status "Open" and severity "High"
    Then only matching findings in "Checkout QA" are returned
    And I can open their linked evidence and history
