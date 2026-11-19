import SwiftUI
import UIKit

/// The colour tokens of the web app (styles.css :root), light and dark — the same values as Theme.kt on Android.
enum Palette {
    static let ground = dyn(0xE3E8E2, 0x0C1311)
    static let paper = dyn(0xFBF8EE, 0x161F1C)
    static let ink = dyn(0x1D2421, 0xEBE4CF)
    static let muted = dyn(0x5F6D66, 0x9AA89F)
    static let frame = dyn(0x1F5A4B, 0x4F9A83)
    static let gilt = dyn(0xA8833A, 0xCFAE62)
    static let line = dyn(0xCFD8D0, 0x2A3632)
    static let chip = dyn(0xEEF2EC, 0x1E2A26)
    static let cur = dyn(0x1F5A4B, 0x78C8AA, alpha: (0.12, 0.16))
    static let danger = dyn(0x9B2C2C, 0xE08A8A)

    private static func dyn(_ light: UInt32, _ dark: UInt32, alpha: (CGFloat, CGFloat) = (1, 1)) -> Color {
        Color(UIColor { t in t.userInterfaceStyle == .dark ? ui(dark, alpha.1) : ui(light, alpha.0) })
    }
    private static func ui(_ hex: UInt32, _ a: CGFloat) -> UIColor {
        UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: a)
    }
}

extension Font {
    /// Figtree, the web app's interface font (bundled; see Info.plist UIAppFonts).
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name = weight == .bold ? "Figtree-Bold" : weight == .semibold ? "Figtree-SemiBold" : "Figtree-Regular"
        return .custom(name, size: size)
    }
    /// Amiri, for Arabic.
    static func amiri(_ size: CGFloat, bold: Bool = false) -> Font { .custom(bold ? "Amiri-Bold" : "Amiri-Regular", size: size) }
}

/// The eight-pointed star of the web app's header (index.html .mark), drawn on a 32-unit grid.
struct BrandMark: View {
    var body: some View {
        Canvas { ctx, size in
            let u = min(size.width, size.height) / 32
            let rect = CGRect(x: 7 * u, y: 7 * u, width: 18 * u, height: 18 * u)
            let square = Path(roundedRect: rect, cornerRadius: 1.5 * u)
            let c = CGPoint(x: 16 * u, y: 16 * u)
            ctx.fill(square, with: .color(Palette.gilt))
            let rotated = square.applying(CGAffineTransform(translationX: -c.x, y: -c.y).concatenating(CGAffineTransform(rotationAngle: .pi / 4))
                .concatenating(CGAffineTransform(translationX: c.x, y: c.y)))
            ctx.fill(rotated, with: .color(Palette.gilt))
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - 5.2 * u, y: c.y - 5.2 * u, width: 10.4 * u, height: 10.4 * u)), with: .color(Palette.paper))
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - 2.2 * u, y: c.y - 2.2 * u, width: 4.4 * u, height: 4.4 * u)), with: .color(Palette.frame))
        }
    }
}

/// The paper card with the Mushaf's green and gilt rules.
struct Framed<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity)
            .background(Palette.paper)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Palette.frame, lineWidth: 2).padding(7))
            .overlay(RoundedRectangle(cornerRadius: 2).stroke(Palette.gilt, lineWidth: 1).padding(11))
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

struct CardBox<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity)
            .background(Palette.paper, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Palette.line, lineWidth: 1))
    }
}
