import XCTest
import UIKit
@testable import Mushaf

/// The bundled fonts load under the names the UI asks for (Theme.swift).
final class FontTests: XCTestCase {
    func testBundledFontsAreRegistered() {
        for name in ["Figtree-Regular", "Figtree-SemiBold", "Figtree-Bold", "Amiri-Regular", "Amiri-Bold"] {
            XCTAssertNotNil(UIFont(name: name, size: 12), "\(name) is not registered")
        }
    }
}
