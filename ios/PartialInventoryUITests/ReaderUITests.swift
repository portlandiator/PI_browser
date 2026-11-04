import XCTest

final class ReaderUITests: XCTestCase {
    func testBookMenuReturnsToCatalogRepeatedly() throws {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let browse = app.buttons["Browse collection"]
        XCTAssertTrue(browse.waitForExistence(timeout: 30))
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: browse)], timeout: 30), .completed)
        func choose(_ section: String) {
            browse.tap()
            let item = app.buttons[section]
            XCTAssertTrue(item.waitForExistence(timeout: 5))
            item.tap()
        }
        // Exercise the native menu, not the similarly named link inside the website.
        for (section, heading) in [("Subjects", "Browse by subject."), ("Volumes", "Read by volume."), ("Subjects", "Browse by subject.")] {
            choose(section)
            XCTAssertTrue(app.webViews.staticTexts[heading].firstMatch.waitForExistence(timeout: 30))
            choose("Catalog")
            let search = app.webViews.textFields.matching(NSPredicate(format: "placeholderValue CONTAINS 'Search words'")).firstMatch
            XCTAssertTrue(search.waitForExistence(timeout: 30))
            XCTAssertEqual(app.state, .runningForeground)
        }
        let search = app.webViews.textFields.matching(NSPredicate(format: "placeholderValue CONTAINS 'Search words'")).firstMatch
        search.tap(); search.typeText("BH00001\n")
        openResult("BH00001", in: app)
        XCTAssertTrue(app.webViews.buttons["← Back to collection"].waitForExistence(timeout: 30))
    }

    func testCatalogBookmarksAndCollection() throws {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout:30))
        let browse = app.buttons["Browse collection"]
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: browse)], timeout: 30), .completed)
        browse.tap(); app.buttons["Catalog"].tap()
        let search = app.webViews.textFields.matching(NSPredicate(format:"placeholderValue CONTAINS 'Search words'")).firstMatch
        XCTAssertTrue(search.waitForExistence(timeout:30))
        search.tap(); search.typeText("BH00001\n")
        openResult("BH00001", in: app)
        // Exact-ID lookup must open an actual source, not only display the query text.
        let back = app.webViews.buttons["← Back to collection"]
        XCTAssertTrue(back.waitForExistence(timeout:30))
        app.buttons["Toggle bookmark"].tap()
        app.buttons["Bookmarks and history"].tap()
        XCTAssertTrue(app.navigationBars["Your reading"].waitForExistence(timeout:5))
        app.buttons["Done"].tap()
        app.buttons["Reader options"].tap()
        app.buttons["Collection and updates"].tap()
        XCTAssertTrue(app.staticTexts["Available offline"].waitForExistence(timeout:5))
        XCTAssertTrue(app.staticTexts["Volume PDFs"].exists)
        let screenshot = XCTAttachment(screenshot:app.screenshot()); screenshot.lifetime = .keepAlways; add(screenshot)
    }

    /// A result row shows its ID beside a link named by the source's title, so
    /// find the row by its ID and open the title link that sits with it.
    private func openResult(_ id: String, in app: XCUIApplication) {
        let code = app.webViews.staticTexts[id].firstMatch
        guard code.waitForExistence(timeout: 15) else { return }
        let row = code.frame
        let link = app.webViews.links.allElementsBoundByIndex.first { $0.frame.minY >= row.minY - 10 && $0.frame.minY <= row.maxY + 120 }
        link?.tap()
    }
}
