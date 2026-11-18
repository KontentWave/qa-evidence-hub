@phase1 @AC03
Feature: Record findings with reusable project evidence

  Background:
    Given I am signed in as the provisioned owner
    And active project "Checkout QA" has session "Regression 1"

  @S1
  Scenario: Create a complete finding linked to captured evidence
    Given Ready screenshot "Payment error" belongs to "Checkout QA"
    When I submit a finding from "Regression 1" linked to "Payment error" with the following values:
      | title           | Payment submission fails                 |
      | description     | Submitting payment displays an error     |
      | severity        | High                                     |
      | steps           | Open checkout; enter test card; submit    |
      | expected_result | An order confirmation appears            |
      | actual_result   | An error appears and no order is created |
    Then the finding is saved as "Open"
    And its evidence and origin session can be reopened
    And a creation event records the owner and timestamp

  @S1
  Scenario Outline: Reject an incomplete finding atomically
    Given a finding draft is otherwise valid
    When I submit it with <missing_requirement>
    Then no finding, evidence link or creation event is saved
    And the form identifies the missing requirement
    And non-sensitive entered values remain available

    Examples:
      | missing_requirement          |
      | an empty title               |
      | an empty expected result     |
      | no ready evidence link       |
      | no origin session            |

  @S1
  Scenario: Reject evidence from another project even with a manipulated request
    Given Ready screenshot "Private other project" belongs to project "Other QA"
    When I submit a finding for "Checkout QA" referencing "Private other project"
    Then the server rejects the cross-project relationship
    And no partial finding or evidence link is saved

  @S1
  Scenario: Reuse a screenshot without copying its stored file
    Given two findings in "Checkout QA" exist
    And Ready screenshot "Payment error" belongs to "Checkout QA"
    When I link that screenshot to both findings
    And I repeat one of those link requests
    Then each finding has exactly one link to the screenshot
    And the provider file count has not increased

  @S2
  Scenario: Edit a finding while retaining its earlier content
    Given a finding exists with title "Payment error"
    When I change its title to "Payment submission fails on Safari"
    Then its current title is updated
    And protected finding history retains the old title, editor and edit time
    And its existing evidence and retests remain linked
