//
//  Utils.swift
//  feedless
//
//  Created by Rogerio Chaves on 04/05/20.
//  Copyright © 2020 Rogerio Chaves. All rights reserved.
//

import UIKit
import SwiftUI

class Utils {
    static let emptyImage = UIColor.white.image(CGSize(width: 64, height: 64));

    static func ssbFolder() -> String {
        let documentsPath = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)[0]
        return documentsPath + "/.ssb";
    }
    
    static func ssbKey() -> SSBKey? {
        if (FileManager.default.fileExists(atPath: ssbFolder() + "/logged-out")) {
            return nil;
        }
        let decoder = JSONDecoder()
        guard
            let data = try? Data(contentsOf: URL(fileURLWithPath: ssbFolder() + "/secret")),
            let ssbKey = try? decoder.decode(SSBKey.self, from: data)
        else {
            return nil
        }
        return ssbKey
    }

    static func blobUrl(blob: String) -> String {
        return "http://127.0.0.1:3000/blob/\(blob)";
    }

    static func avatarUrl(profile: Profile) -> String? {
        if let image = profile.image {
            return Utils.blobUrl(blob: image)
        }
        return nil
    }

    static func escapeMarkdown(_ str : String) -> String {
        var result = str;

        let imagesPattern = #"!\[.*?\]\((.*?)\)"#
        result = result.replacingOccurrences(of: imagesPattern, with: "$1", options: .regularExpression);

        let mentionPattern = #"\[(@.*?)\]\(@.*?\)"#
        result = result.replacingOccurrences(of: mentionPattern, with: "$1", options: .regularExpression);

        let linksPattern = #"\[.*?\]\((.*?)\)"#
        result = result.replacingOccurrences(of: linksPattern, with: "$1", options: .regularExpression);

        let headersPattern = #"(^|\n)#+ "#
        result = result.replacingOccurrences(of: headersPattern, with: "", options: .regularExpression);
        return result;
    }

    static func splitInSmallPosts(_ text : String, limit : Int = 140) -> [String] {
        let text = escapeMarkdown(text);

        if (text.count <= limit) {
            return [text]
        }

        var splittedPosts : [String] = [];
        let words = text.split(separator: " ")
        var nextPost = ""
        for word in words {
            let postsCount = splittedPosts.count + 1;
            let pageMarker = "\(postsCount)/"

            if (nextPost.count + word.count + pageMarker.count + 1 < limit) {
              nextPost += word + " "
            } else {
              splittedPosts.append(nextPost + pageMarker)
              nextPost = word + " "
            }
        }
        let postsCount = splittedPosts.count + 1;
        let lastMarker = postsCount > 1 ? "\(postsCount)/\(postsCount)" : ""
        splittedPosts.append(nextPost + lastMarker)
        return splittedPosts.reversed()
    }

    static func topicTitle(_ topic: TopicEntry) -> String {
        var title = escapeMarkdown(topic.value.content.title ?? topic.value.content.text)

        let ssbRefPattern = #"((&|%).*?=\.sha\d+)"#
        title = title.replacingOccurrences(of: ssbRefPattern, with: "", options: .regularExpression)

        title = title.replacingOccurrences(of: #"\n"#, with: " ", options: .regularExpression)

        if (title.count > 60) {
          return title.prefix(60) + "...";
        }
        return title
    }

    static func changeNavigationColor(_ color: UIColor) {
        let coloredAppearance = UINavigationBarAppearance()
        coloredAppearance.configureWithTransparentBackground()
        coloredAppearance.backgroundColor = color
        coloredAppearance.titleTextAttributes = [.foregroundColor: UIColor.black]
        coloredAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor.black]

        UINavigationBar.appearance().standardAppearance = coloredAppearance
        UINavigationBar.appearance().compactAppearance = coloredAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = coloredAppearance
        UINavigationBar.appearance().tintColor = .white
    }

    static func debug(_ str: String) {
        if ProcessInfo.processInfo.environment["DEBUG_SWIFT"] != nil {
            print(str)
        }
    }
}
