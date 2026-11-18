@phase1 @AC02
Feature: Capture evidence with honest source context
  Accepted submissions remain traceable and failed uploads can be recovered.

  Background:
    Given I am signed in as the provisioned owner
    And active project "Checkout QA" has session "Regression 1"

  @S1
  Scenario Outline: Store an accepted screenshot without changing its bytes
    Given I select a valid <format> screenshot within the byte and pixel limits
    When I upload it to "Checkout QA" and "Regression 1"
    Then one Ready evidence record is created with kind "Screenshot"
    And retrieving the file returns the submitted bytes
    And its checksum equals the SHA-256 of those submitted bytes
    And its project and session are retained
    And no tested-page URL or tested-browser value is invented

    Examples:
      | format |
      | PNG    |
      | JPEG   |

  @S1
  Scenario: Fall back to file selection when clipboard paste is unavailable
    Given clipboard image paste is unavailable in my browser
    When I open the evidence capture form
    Then I can select and upload an image file

  @S1
  Scenario Outline: Reject unsafe or excessive files before provider upload
    Given I select <invalid_file>
    When I submit it as screenshot evidence
    Then validation rejects the submission with a useful error
    And no provider upload is started
    And no Ready evidence record is created

    Examples:
      | invalid_file                                      |
      | a PNG larger than 10485760 bytes                   |
      | a PNG whose decoded image exceeds 25 megapixels   |
      | an HTML file renamed with a .png extension         |
      | an SVG image                                      |
      | a file containing invalid image bytes             |

  @S1
  Scenario: Sanitize browser context before persistence
    Given I supply URL "https://user:secret@example.test/checkout?token=secret&customer=123#session"
    When I confirm the preview and upload a valid screenshot
    Then the saved URL is "https://example.test/checkout"
    And the username, password, query and fragment are absent from stored context and logs
    And the source URL is not fetched

  @S1
  Scenario: Remove a sensitive path from optional URL context
    Given I supply URL "https://example.test/customers/private-person"
    When I choose origin-only context and confirm the preview
    And I upload a valid screenshot
    Then the saved URL is "https://example.test/"
    And the sensitive path is absent from stored context and logs

  @S1
  Scenario: Recover when the storage provider rejects an upload
    Given the storage provider will reject the first upload attempt
    When I submit a valid screenshot
    Then the evidence is not Ready or linkable
    And I see a retry action
    When storage becomes available and I retry the same operation with the same file
    Then exactly one Ready evidence record and one stored file exist for that operation

  @S1
  Scenario: Recover when storage succeeds but database finalization fails
    Given the provider will store the file but the first database finalization will fail
    When I upload a valid screenshot
    And I retry the same operation after database recovery
    Then the original provider file is reconciled
    And exactly one Ready evidence record and one stored file exist for that operation

  @S1
  Scenario: Prevent a retry from replacing the source file
    Given an upload operation was created for one screenshot
    When I retry its operation ID with different file bytes
    Then the retry is rejected
    And the original operation and file remain unchanged

  @S1
  Scenario: Enforce the storage budget despite overlapping requests
    Given only 6 MiB of the configured storage budget remains unreserved
    When two uploads of 4 MiB are submitted concurrently
    Then no more than one upload reserves space and proceeds
    And the other receives a quota or in-flight-operation error
    And used storage plus reservations does not exceed the budget

  @S2
  Scenario Outline: Capture the remaining supported evidence kinds
    Given I enter <valid_content> with a non-empty title
    When I save it as <kind> evidence in "Checkout QA"
    Then a Ready evidence item of kind <kind> is created
    And its content can be retrieved privately

    Examples:
      | kind  | valid_content                        |
      | Image | a valid JPEG within the limits       |
      | Text  | a non-empty human note               |
      | URL   | an absolute HTTPS URL                |
      | File  | a detected PDF within the byte limit |
      | File  | a UTF-8 TXT file within the byte limit |

  @S2
  Scenario: Reject an executable URL scheme
    When I submit URL evidence with "javascript:alert(1)"
    Then no evidence item is created
    And the form requests an absolute HTTP or HTTPS URL

  @S2
  Scenario: Preserve separate capture records with identical bytes
    Given a screenshot is already stored in "Regression 1"
    When I create a new capture in another session using identical bytes
    Then two distinct evidence records retain their own session context
    And neither record is automatically merged or removed
