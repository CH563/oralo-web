// macOS: swift scripts/generate-app-store-qr.swift
// Generate a local QR asset from the same product URL used by the website.
import Foundation
import CoreImage
import AppKit
import Vision

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let product = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("src/content/product.json"))) as! [String: Any]
let payload = product["appStoreUrl"] as! String
let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(Data(payload.utf8), forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")
let qr = filter.outputImage!
let scale = 8
let quietZone = 4
let side = (Int(qr.extent.width) + quietZone * 2) * scale
let cg = CIContext().createCGImage(qr, from: qr.extent)!
let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(gray: 1, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: side, height: side))
context.interpolationQuality = .none
context.draw(cg, in: CGRect(x: quietZone * scale, y: quietZone * scale, width: Int(qr.extent.width) * scale, height: Int(qr.extent.height) * scale))
let output = context.makeImage()!
let png = NSBitmapImageRep(cgImage: output).representation(using: .png, properties: [:])!
let url = root.appendingPathComponent("public/assets/app-store-qr.png")
try png.write(to: url)
// Independently decode the generated PNG, including its quiet zone.
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
try VNImageRequestHandler(url: url).perform([request])
guard request.results?.contains(where: { $0.payloadStringValue == payload }) == true else { fatalError("QR payload did not round-trip") }
print("Verified QR: \(side)×\(side), \(png.count) bytes, \(payload)")
