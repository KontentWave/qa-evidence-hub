@phase1 @S2 @AC05
Feature: Preserve observations alongside defects

  Background:
    Given I am signed in as the provisioned owner
    And active project "Checkout QA" exists

  Scenario: Record a human observation without evidence
    When I create a "Marketing" observation titled "Delivery promise is unclear" with a non-empty body
    Then the observation is saved as a human submission
    And no screenshot or defect severity is required

  Scenario: Reuse a finding's evidence for an observation
    Given a finding in "Checkout QA" links Ready screenshot "Checkout screen"
    When I create a "UX" observation linked to "Checkout screen"
    Then both records reference the same evidence item
    And no additional provider file is created

  Scenario: Reject a cross-project observation link
    Given Ready evidence belongs to project "Other QA"
    When I create an observation in "Checkout QA" linked to that evidence
    Then the server rejects the request without saving a partial observation
