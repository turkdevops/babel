class C extends class {} {
  #x;

  constructor() {
    class ShouldPreserveParens {
      @(decs[0])
      @(decs`1`)
      @(this?.two)
      @(self.#x)
      @(this.dec)
      @(super.dec)
      @(new DecFactory())
      @(decs[three])()
      p;
    }

    class ShouldNotAddParens {
      @decs
      @decs.one
      @decs.two()
      p;
    }

    class WillPreserveParens {
      @(decs)
      @(decs.one)
      @(decs.two())
      p;
    }
  }

}