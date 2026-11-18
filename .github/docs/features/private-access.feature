@phase1 @S1 @AC07
Feature: Keep the personal workspace private

  Scenario Outline: Require login for protected HTML pages
    Given I am not signed in
    When I request the <page> directly
    Then I am redirected to login without protected content

    Examples:
      | page               |
      | project page       |
      | finding page       |
      | project report     |

  Scenario: Block a direct evidence download without login
    Given I am not signed in
    When I request a valid private evidence download URL
    Then I receive an unauthorized response with no evidence bytes
    And I am not redirected to a publicly accessible provider file

  Scenario: Reject a mutation without a valid anti-CSRF token
    Given I am signed in as the provisioned owner
    When I submit an otherwise valid finding creation request without a valid anti-CSRF token
    Then the request is rejected without creating records

  Scenario: Do not provide public self-registration
    Given the owner account has been provisioned
    When an anonymous visitor attempts to register an account
    Then no public registration operation is available
    And no additional account is created
