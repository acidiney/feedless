//
//  ContentView.swift
//  feedless
//
//  Created by Rogerio Chaves on 28/04/20.
//  Copyright © 2020 Rogerio Chaves. All rights reserved.
//

import SwiftUI

class FetchPosts: ObservableObject {
    @Published var posts = [Entry<AuthorContent<Post>>]()

    init() {
        let url = URL(string: "http://127.0.0.1:3000/posts")!

        URLSession.shared.dataTask(with: url) {(data, response, error) in
            do {
                if let todoData = data {
                    let decodedData = try JSONDecoder().decode([Entry<AuthorContent<Post>>].self, from: todoData)
                    DispatchQueue.main.async {
                        self.posts = decodedData
                    }
                } else {
                    print("No data loading posts")
                }
            } catch {
                print("Error loading posts")
            }
        }.resume()
    }
}

struct Wall: View {
    @EnvironmentObject var context : Context
    @State private var selection = 0

    @ObservedObject var fetch = FetchPosts()

    let actionSheet1 = ActionSheet(title: Text("Title"), message: Text("Message"), buttons: [.default(Text("OK")) {print("You did something")}, .cancel()])

    var body: some View {
        TabView(selection: $selection){
            NavigationMenu {
                List(fetch.posts, id: \.key) { post in
                    VStack(alignment: .leading) {
                        Text(post.value.content.text)
                    }
                }
                .navigationBarTitle(Text("Profile"))
            }
            .tabItem {
                VStack {
                    Image(uiImage: "🙂".image()!).renderingMode(.original)
                    Text("Profile")
                }
            }
            .tag(0)
            NavigationMenu {
                Text("Second View")
                .navigationBarTitle(Text("Friends"))
            }
                .font(.title)
                .tabItem {
                    VStack {
                        Image(uiImage: "👨‍👧‍👦".image()!).renderingMode(.original)
                        Text("Friends")
                    }
            }
            .tag(1)
            NavigationMenu {
                Debug()
                .navigationBarTitle(Text("Debug"))
            }
                .tabItem {
                    VStack {
                        Image(uiImage: "🛠".image()!).renderingMode(.original)
                        Text("Debug")
                    }
            }
            .tag(2)
        }
        .accentColor(Color.purple)
    }
}

struct Wall_Previews: PreviewProvider {
    static var previews: some View {
        Wall()
    }
}
