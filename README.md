# Trại hè Ngôn ngữ và Nghệ thuật

Repository chứa các ứng dụng web phục vụ hoạt động **kiểm tra và luyện phát âm hai âm đầu L/N** trong chương trình Trại hè Ngôn ngữ và Nghệ thuật.

Các ứng dụng được triển khai trực tiếp bằng **GitHub Pages** và có thể sử dụng trên trình duyệt mà không cần cài đặt thêm phần mềm.

## Các bài kiểm tra

Bài kiểm tra được sử dụng để ghi nhận phần phát âm của học sinh phục vụ hoạt động assessment.

* Link đến bài test số 1: https://edtech-vinuni.github.io/traihengonnguvanghethuat/kiemtraphatamln-class-1/
* Link đến bài test số 2: https://edtech-vinuni.github.io/traihengonnguvanghethuat/kiemtraphatamln-class-2/

## Các bài luyện phát âm

Các bài luyện cho phép học sinh luyện tập phát âm L/N theo nội dung của từng buổi học.

* Link đến bài luyện số 1: https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-1/
* Link đến bài luyện số 2: https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-2/
* Link đến bài luyện số 3: https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-3/
* Link đến bài luyện số 4: https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-4/
* Link đến bài luyện số 5: https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-5/
* Link đến bài luyện số 6: https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-6/

## Cấu trúc repository

```text
traihengonnguvanghethuat/
│
├── kiemtraphatamln-class-1/
├── kiemtraphatamln-class-2/
├── kiemtraphatamln.v2-template/
│
├── luyenphatamln-class-1/
├── luyenphatamln-class-2/
├── luyenphatamln-class-3/
├── luyenphatamln-class-4/
├── luyenphatamln-class-5/
├── luyenphatamln-class-6/
└── luyenphatamln.v2-template/
```

Mỗi thư mục bài học là một web app độc lập, thông thường gồm:

```text
index.html
app.js
styles.css
config.json
l.png / L.png
n.png / N.png
```

Trong đó:

* `index.html`: giao diện chính của ứng dụng.
* `app.js`: logic hoạt động của ứng dụng.
* `styles.css`: định dạng giao diện.
* `config.json`: cấu hình nội dung của từng bài, bao gồm câu luyện tập, thời gian và các thông tin liên quan.
* `l.png`, `n.png`: hình ảnh hỗ trợ phân biệt hai âm L/N.

## Chỉnh sửa nội dung bài học

Phần lớn nội dung của mỗi bài có thể được thay đổi trong file:

```text
config.json
```

Ví dụ một item:

```json
{
  "id": "thanh_nien",
  "text": "thanh niên",
  "time_limit_seconds": 40,
  "syllables": [
    {
      "text": "thanh",
      "target": null
    },
    {
      "text": "_iên",
      "target": "n"
    }
  ]
}
```

Mỗi bài có thể cấu hình độc lập mà không cần thay đổi các bài còn lại.

## Template

Repository có hai thư mục template để tạo bài mới:

* `kiemtraphatamln.v2-template`: template cho bài kiểm tra.
* `luyenphatamln.v2-template`: template cho bài luyện.

Để tạo một bài mới, có thể copy thư mục template hoặc một bài hiện có, đổi tên thư mục và chỉnh sửa `config.json`.

Ví dụ:

```text
luyenphatamln-class-7/
```

Sau khi push lên branch `main`, nếu GitHub Pages của repository đang được cấu hình để deploy từ repository, bài mới có thể được truy cập theo dạng:

```text
https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-7/
```

## Repository

GitHub:

https://github.com/edtech-vinuni/traihengonnguvanghethuat
