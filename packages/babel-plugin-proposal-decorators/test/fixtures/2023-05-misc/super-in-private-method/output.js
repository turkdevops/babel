var _call_x, _initProto, _Bar;
const dec = () => {};
class Foo extends (_Bar = Bar) {
  static {
    [_call_x, _initProto] = babelHelpers.applyDecs2305(this, [[dec, 2, "x", function () {
      return babelHelpers.get(babelHelpers.getPrototypeOf(Foo), "foo", this).call(this);
    }]], [], 0, _ => #x in _, _Bar).e;
  }
  constructor(...args) {
    super(...args);
    _initProto(this);
  }
  #x = _call_x;
}
